// Team chat: one-to-one messages between people on the team list.
//   GET  ?op=threads                 my conversations, with unread counts
//   GET  ?op=messages&with=<email>   one conversation (newest months first, ?before=YYYY-MM for older)
//   GET  ?op=messages&pair=<a|b>     the owner reading someone else's conversation
//   GET  ?op=stream                  live events (Server-Sent Events)
//   POST { op: "send", to, text, id }
//   POST { op: "read", with }
//   POST { op: "push", token, remove }   this phone's Firebase token, for notifications when the app is closed
// Messages are never deleted. Only the owner account can read conversations
// it is not part of; nobody else can, including view-only admins.
//
// Storage:
//   field:chat:<a|b>:<YYYY-MM>  hash  id -> message, one per conversation per month
//   field:chat:threads          hash  a|b -> { a, b, months, last, count }
//   field:chat:state            hash  <email>><a|b> -> { unread, seen }
import { store } from "../lib/store.js";
import { guard, readBody, fail, loadUsers, rid, OWNER } from "../lib/auth.js";
import { publish, listen } from "../lib/bus.js";
import { pushTo, savePushToken, dropPushToken } from "../lib/push.js";

const THREADS = "field:chat:threads";
const STATE = "field:chat:state";
const PAGE = 60;

export const pairOf = (a, b) => [String(a).toLowerCase(), String(b).toLowerCase()].sort().join("|");
const monthOf = (at) => new Date(at + 345 * 60000).toISOString().slice(0, 7); // Nepal time
const msgKey = (pair, month) => `field:chat:${pair}:${month}`;

// Writes to one thread happen one after another, so counts never clash.
const locks = globalThis.__fieldChatLocks || (globalThis.__fieldChatLocks = new Map());
function serial(key, fn) {
  const before = locks.get(key) || Promise.resolve();
  const run = before.then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => locks.get(key) === tail && locks.delete(key));
  return run;
}

// A short burst limit, so a stuck button cannot flood a conversation.
const recent = globalThis.__fieldChatRate || (globalThis.__fieldChatRate = new Map());
function tooFast(email) {
  const now = Date.now();
  const list = (recent.get(email) || []).filter((t) => now - t < 60000);
  list.push(now);
  recent.set(email, list);
  return list.length > 40;
}

// Keeps line breaks, removes control characters and long runs of blank lines.
function cleanText(v) {
  return String(v == null ? "" : v)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 2000);
}

const stateOf = async (email, pair) => (await store.hget(STATE, `${email}>${pair}`)) || { unread: 0, seen: 0 };

export default async function handler(req, res) {
  try {
    const me = await guard(req, res);
    if (!me) return;
    const owner = me.email === OWNER;
    const op = req.method === "GET" ? String(req.query.op || "threads") : String(readBody(req).op || "");

    if (req.method === "GET" && op === "stream") return stream(req, res, me);

    const users = await loadUsers();
    const person = (email) => {
      const u = users[String(email || "").toLowerCase()];
      return u && u.active !== false ? u : null;
    };

    if (req.method === "GET" && op === "threads") {
      const all = await store.hall(THREADS);
      const mine = [];
      const others = [];
      for (const t of Object.values(all)) {
        if (t.a === me.email || t.b === me.email) {
          const other = t.a === me.email ? t.b : t.a;
          const [mineState, theirs] = await Promise.all([stateOf(me.email, t.pair), stateOf(other, t.pair)]);
          mine.push({ pair: t.pair, with: other, last: t.last, count: t.count, unread: mineState.unread || 0, seenByThem: theirs.seen || 0 });
        } else if (owner) {
          others.push({ pair: t.pair, a: t.a, b: t.b, last: t.last, count: t.count });
        }
      }
      const byLast = (x, y) => (y.last ? y.last.at : 0) - (x.last ? x.last.at : 0);
      return res.json({ threads: mine.sort(byLast), all: owner ? others.sort(byLast) : undefined, canSeeAll: owner });
    }

    if (req.method === "GET" && op === "messages") {
      let pair;
      if (req.query.pair) {
        pair = String(req.query.pair).toLowerCase();
        const [a, b] = pair.split("|");
        if (!a || !b || pairOf(a, b) !== pair) return res.status(400).json({ error: "That conversation was not found." });
        if (a !== me.email && b !== me.email && !owner) return res.status(403).json({ error: "Only the owner can read other people's chats." });
      } else {
        const other = String(req.query.with || "").toLowerCase();
        if (!users[other] || other === me.email) return res.status(400).json({ error: "Pick a person from the team list." });
        pair = pairOf(me.email, other);
      }
      const thread = await store.hget(THREADS, pair);
      const [a, b] = pair.split("|");
      const seen = { [a]: (await stateOf(a, pair)).seen || 0, [b]: (await stateOf(b, pair)).seen || 0 };
      if (!thread) return res.json({ pair, messages: [], older: null, seen });
      const before = /^\d{4}-\d{2}$/.test(String(req.query.before || "")) ? req.query.before : "9999-99";
      const months = (thread.months || []).filter((m) => m < before).sort();
      const out = [];
      let i = months.length - 1;
      while (i >= 0 && out.length < PAGE) {
        out.push(...Object.values(await store.hall(msgKey(pair, months[i]))));
        i -= 1;
      }
      out.sort((x, y) => x.at - y.at || (x.id < y.id ? -1 : 1));
      return res.json({ pair, messages: out, older: i >= 0 ? months[i + 1] : null, seen });
    }

    if (req.method === "POST" && op === "send") {
      const b = readBody(req);
      const to = person(b.to);
      if (!to || to.email === me.email) return res.status(400).json({ error: "Pick a person from the team list." });
      const text = cleanText(b.text);
      if (!text) return res.status(400).json({ error: "Type a message first." });
      if (tooFast(me.email)) return res.status(429).json({ error: "Too many messages at once. Wait a moment." });
      const id = /^m_[a-z0-9]{6,14}_[a-z0-9]{3,12}$/.test(String(b.id || "")) ? b.id : `m_${Date.now().toString(36)}_${rid(4)}`;
      const pair = pairOf(me.email, to.email);

      const msg = await serial(pair, async () => {
        const at = Date.now();
        const month = monthOf(at);
        // A message sent again after a lost answer is not saved twice.
        const thread = (await store.hget(THREADS, pair)) || { pair, a: pair.split("|")[0], b: pair.split("|")[1], months: [], count: 0 };
        for (const m of (thread.months || []).slice(-2)) {
          const dup = await store.hget(msgKey(pair, m), id);
          if (dup) return { ...dup, duplicate: true };
        }
        const saved = { id, from: me.email, to: to.email, text, at };
        await store.hset(msgKey(pair, month), id, saved);
        if (!thread.months.includes(month)) thread.months.push(month);
        thread.count = (thread.count || 0) + 1;
        thread.last = { id, from: me.email, text: text.slice(0, 140), at };
        await store.hset(THREADS, pair, thread);
        const theirs = await stateOf(to.email, pair);
        const unread = (theirs.unread || 0) + 1;
        await store.hset(STATE, `${to.email}>${pair}`, { ...theirs, unread });
        const mineState = await stateOf(me.email, pair);
        await store.hset(STATE, `${me.email}>${pair}`, { ...mineState, seen: at });
        return { ...saved, unread };
      });

      const { duplicate, unread, ...clean } = msg;
      if (!duplicate) {
        const event = { type: "message", pair, msg: clean };
        publish(me.email, event);
        publish(to.email, event);
        if (OWNER !== me.email && OWNER !== to.email) publish(OWNER, { ...event, watch: true });
        // The phone rings even when the app is closed. A failure here never stops the message.
        await pushTo(to.email, {
          title: unread > 1 ? `${me.name} (${unread} messages)` : me.name,
          body: text.length > 300 ? text.slice(0, 297) + "…" : text,
          tag: pair,
          count: unread,
          data: { type: "chat", from: me.email, pair },
        }).catch((e) => console.error("Push failed", e.message));
      }
      return res.json({ msg: clean });
    }

    if (req.method === "POST" && op === "read") {
      const b = readBody(req);
      const other = String(b.with || "").toLowerCase();
      if (!users[other] || other === me.email) return res.status(400).json({ error: "Pick a person from the team list." });
      const pair = pairOf(me.email, other);
      const at = Date.now();
      await serial(pair, async () => {
        const mineState = await stateOf(me.email, pair);
        await store.hset(STATE, `${me.email}>${pair}`, { ...mineState, unread: 0, seen: at });
      });
      const event = { type: "read", pair, by: me.email, at };
      publish(other, event);
      publish(me.email, event);
      return res.json({ ok: true });
    }

    if (req.method === "POST" && op === "push") {
      const b = readBody(req);
      const token = String(b.token || "").trim();
      if (!/^[\w:\-.]{20,4096}$/.test(token)) return res.status(400).json({ error: "That phone could not be registered." });
      if (b.remove) await dropPushToken(me.email, token);
      else await savePushToken(me.email, token);
      return res.json({ ok: true });
    }

    res.status(400).json({ error: "Unknown chat request." });
  } catch (e) {
    fail(res, e);
  }
}

// Keeps one connection open per screen and pushes each event as it happens.
function stream(req, res, me) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  res.write(`event: hello\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  const stop = listen(me.email, (event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
  // A comment every 20 seconds keeps phone networks and proxies from closing the line.
  const ping = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 20000);
  const end = () => {
    clearInterval(ping);
    stop();
  };
  req.on("close", end);
  res.on("error", end);
}
