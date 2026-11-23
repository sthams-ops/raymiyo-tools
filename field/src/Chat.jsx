// Team chat. A round button sits at the bottom right of every screen. It
// opens a chat window (full screen on phones) with one conversation per
// person. Messages arrive live over one open connection (/api/chat?op=stream),
// make a sound, and show a small preview when the chat is closed.
// The owner also gets "Team chats": every conversation, read-only.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, ArrowLeft, SendHorizontal, Check, CheckCheck, Clock3, AlertCircle, ChevronDown, Eye } from "lucide-react";
import { api } from "./api.js";
import { Avatar, firstName } from "./ui.jsx";
import { ROLES } from "../shared/rules.js";
import { playSent, playReceived, unlockSound } from "./sound.js";
import { startPush, clearNotices } from "./push.js";

// Other screens use these to point the chat at a person.
export const chatTarget = (email) => window.dispatchEvent(new CustomEvent("field:chat-target", { detail: { email: email || null } }));
export const openChat = (email) => window.dispatchEvent(new CustomEvent("field:chat-open", { detail: { email: email || null } }));

const pairOf = (a, b) => [a, b].sort().join("|");
const newId = () => `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const localDay = (at) => new Date(at).toLocaleDateString("en-CA");
const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function dayLabel(at) {
  const d = localDay(at);
  const now = Date.now();
  if (d === localDay(now)) return "Today";
  if (d === localDay(now - 86400000)) return "Yesterday";
  return new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: new Date(at).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
function shortWhen(at) {
  if (!at) return "";
  const label = dayLabel(at);
  if (label === "Today") return timeOf(at);
  if (label === "Yesterday") return label;
  return new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function upsert(list, msg) {
  const i = list.findIndex((m) => m.id === msg.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...msg };
    return next;
  }
  return [...list, msg].sort((x, y) => x.at - y.at);
}
const coarse = () => window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

function Linked({ text }) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    i % 2 ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : part
  );
}

export default function Chat({ me, users }) {
  const userMap = useMemo(() => Object.fromEntries(users.map((u) => [u.email, u])), [users]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ kind: "list" }); // list | thread (key = email) | watch (key = pair)
  const [tab, setTab] = useState("mine");
  const [threads, setThreads] = useState([]);
  const [all, setAll] = useState([]);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [convos, setConvos] = useState({});
  const [target, setTarget] = useState(null);
  const [peek, setPeek] = useState(null);
  const [live, setLive] = useState(false);
  const state = useRef({});
  state.current = { open, view };
  const peekTimer = useRef(null);

  const loadThreads = useCallback(async () => {
    try {
      const r = await api.chatThreads();
      setThreads(r.threads || []);
      setAll(r.all || []);
      setCanSeeAll(!!r.canSeeAll);
    } catch {}
  }, []);

  const loadConvo = useCallback(
    async (v, before) => {
      const pair = v.kind === "thread" ? pairOf(me.email, v.key) : v.key;
      const q = v.kind === "thread" ? { with: v.key } : { pair: v.key };
      if (before) q.before = before;
      try {
        const r = await api.chatMessages(q);
        setConvos((c) => {
          const was = c[pair] || { messages: [] };
          // Keep messages still being sent from this phone.
          const local = was.messages.filter((m) => m.status && !r.messages.some((x) => x.id === m.id));
          const merged = before ? [...r.messages, ...was.messages] : [...r.messages, ...local].sort((x, y) => x.at - y.at);
          return { ...c, [pair]: { messages: merged, older: r.older, seen: { ...(was.seen || {}), ...r.seen }, loaded: true } };
        });
      } catch (e) {
        setConvos((c) => ({ ...c, [pair]: { ...(c[pair] || { messages: [] }), loaded: true, error: e.message } }));
      }
    },
    [me.email]
  );

  const markRead = useCallback(
    (other) => {
      setThreads((ts) => ts.map((t) => (t.with === other ? { ...t, unread: 0 } : t)));
      api.chatRead(other).catch(() => {});
      clearNotices(pairOf(me.email, other));
    },
    [me.email]
  );

  const viewing = useCallback(
    (pair) => {
      const { open: o, view: v } = state.current;
      return o && document.visibilityState === "visible" && v.kind === "thread" && pairOf(me.email, v.key) === pair;
    },
    [me.email]
  );

  // Live events from the server.
  const onEvent = useRef(null);
  onEvent.current = (ev) => {
    if (ev.type === "message") {
      const { msg, pair } = ev;
      setConvos((c) => (c[pair] ? { ...c, [pair]: { ...c[pair], messages: upsert(c[pair].messages, msg) } } : c));
      const last = { id: msg.id, from: msg.from, text: msg.text.slice(0, 140), at: msg.at };
      if (ev.watch) {
        const [a, b] = pair.split("|");
        setAll((list) => [{ ...(list.find((t) => t.pair === pair) || { pair, a, b, count: 0 }), last }, ...list.filter((t) => t.pair !== pair)]);
        return;
      }
      const other = msg.from === me.email ? msg.to : msg.from;
      const seeing = viewing(pair);
      const incoming = msg.to === me.email;
      setThreads((ts) => {
        const was = ts.find((t) => t.pair === pair) || { pair, with: other, unread: 0, seenByThem: 0, count: 0 };
        const next = { ...was, last, unread: incoming && !seeing ? (was.unread || 0) + 1 : was.unread || 0 };
        return [next, ...ts.filter((t) => t.pair !== pair)];
      });
      if (incoming) {
        if (document.visibilityState === "visible") playReceived();
        if (seeing) markRead(other);
        else if (!state.current.open) {
          setPeek({ from: msg.from, text: msg.text });
          clearTimeout(peekTimer.current);
          peekTimer.current = setTimeout(() => setPeek(null), 6000);
        }
      }
    } else if (ev.type === "read" && ev.by !== me.email) {
      const { pair, by, at } = ev;
      setConvos((c) => (c[pair] ? { ...c, [pair]: { ...c[pair], seen: { ...c[pair].seen, [by]: at } } } : c));
      setThreads((ts) => ts.map((t) => (t.pair === pair ? { ...t, seenByThem: at } : t)));
    } else if (ev.type === "read" && ev.by === me.email) {
      // Read on another screen of mine.
      setThreads((ts) => ts.map((t) => (t.pair === ev.pair ? { ...t, unread: 0 } : t)));
    }
  };

  useEffect(() => {
    let es = null;
    let closed = false;
    let retry = null;
    const refresh = () => {
      loadThreads();
      const v = state.current.view;
      if (state.current.open && v.kind !== "list") loadConvo(v);
    };
    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/chat?op=stream");
      es.addEventListener("hello", () => {
        setLive(true);
        refresh();
      });
      es.onmessage = (e) => {
        try {
          onEvent.current(JSON.parse(e.data));
        } catch {}
      };
      es.onerror = () => {
        setLive(false);
        // The browser reconnects by itself unless the server refused; then try again later.
        if (es.readyState === 2) {
          clearTimeout(retry);
          retry = setTimeout(connect, 8000);
        }
      };
    };
    connect();
    // Safety net for phones that drop the line while asleep.
    const back = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      const v = state.current.view;
      if (state.current.open && v.kind === "thread") markRead(v.key);
      if (es && es.readyState === 2) connect();
    };
    const timer = setInterval(() => document.visibilityState === "visible" && loadThreads(), 45000);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("online", back);
    const unlock = () => unlockSound();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    return () => {
      closed = true;
      clearTimeout(retry);
      clearInterval(timer);
      if (es) es.close();
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("online", back);
      window.removeEventListener("pointerdown", unlock, { capture: true });
    };
  }, [loadThreads, loadConvo, markRead]);

  // Back button (Android and browser): thread → list → closed.
  const enterThread = useCallback(
    (v) => {
      window.history.pushState({ fieldChat: 2 }, "");
      setView(v);
      loadConvo(v);
      if (v.kind === "thread") markRead(v.key);
    },
    [loadConvo, markRead]
  );
  const openPanel = useCallback(
    (email) => {
      setPeek(null);
      if (!state.current.open) window.history.pushState({ fieldChat: 1 }, "");
      setOpen(true);
      setView({ kind: "list" });
      loadThreads();
      if (email) enterThread({ kind: "thread", key: email });
    },
    [enterThread, loadThreads]
  );
  const closePanel = () => {
    const depth = (window.history.state && window.history.state.fieldChat) || 0;
    if (depth > 0) window.history.go(-depth);
    else setOpen(false);
  };
  const toList = () => {
    if (window.history.state && window.history.state.fieldChat === 2) window.history.back();
    else setView({ kind: "list" });
  };
  useEffect(() => {
    const onPop = (e) => {
      const depth = (e.state && e.state.fieldChat) || 0;
      if (depth === 0) {
        setOpen(false);
        setView({ kind: "list" });
      } else if (depth === 1) setView({ kind: "list" });
    };
    startPush((email) => openPanel(email));
    const onTarget = (e) => setTarget(e.detail.email);
    const onOpen = (e) => openPanel(e.detail.email);
    window.addEventListener("popstate", onPop);
    window.addEventListener("field:chat-target", onTarget);
    window.addEventListener("field:chat-open", onOpen);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("field:chat-target", onTarget);
      window.removeEventListener("field:chat-open", onOpen);
    };
  }, [openPanel]);

  // Phones: the chat covers the screen, so the page behind must not scroll.
  useEffect(() => {
    document.body.classList.toggle("chat-open", open);
    return () => document.body.classList.remove("chat-open");
  }, [open]);

  const unread = threads.reduce((t, x) => t + (x.unread || 0), 0);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread ? `(${unread}) ${base}` : base;
    try {
      if (unread && navigator.setAppBadge) navigator.setAppBadge(unread).catch(() => {});
      else if (!unread && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    } catch {}
  }, [unread]);

  async function send(other, text, retryOf) {
    const pair = pairOf(me.email, other);
    const msg = retryOf ? { ...retryOf, status: "sending", error: "" } : { id: newId(), from: me.email, to: other, text, at: Date.now(), status: "sending" };
    setConvos((c) => ({ ...c, [pair]: { ...(c[pair] || { messages: [], seen: {} }), messages: upsert((c[pair] && c[pair].messages) || [], msg) } }));
    try {
      const r = await api.chatSend(other, msg.text, msg.id);
      playSent();
      setConvos((c) => ({ ...c, [pair]: { ...c[pair], messages: upsert(c[pair].messages, r.msg) } }));
      setThreads((ts) => {
        const was = ts.find((t) => t.pair === pair) || { pair, with: other, unread: 0, seenByThem: 0 };
        return [{ ...was, last: { id: r.msg.id, from: me.email, text: r.msg.text.slice(0, 140), at: r.msg.at } }, ...ts.filter((t) => t.pair !== pair)];
      });
    } catch (e) {
      setConvos((c) => ({ ...c, [pair]: { ...c[pair], messages: upsert(c[pair].messages, { ...msg, status: "failed", error: e.offline ? "No signal" : e.message }) } }));
    }
  }

  const targetUser = target && target !== me.email ? userMap[target] : null;
  const pair = view.kind === "thread" ? pairOf(me.email, view.key) : view.kind === "watch" ? view.key : null;
  const convo = pair ? convos[pair] : null;

  return (
    <>
      {!open && peek && userMap[peek.from] && (
        <button className="chat-peek" onClick={() => openPanel(peek.from)}>
          <Avatar user={userMap[peek.from]} size={34} />
          <span>
            <b>{userMap[peek.from].name}</b>
            <span>{peek.text}</span>
          </span>
        </button>
      )}
      {!open && (
        <button className={"chat-fab" + (targetUser ? " wide" : "")} onClick={() => openPanel(targetUser ? targetUser.email : null)} aria-label={targetUser ? `Message ${targetUser.name}` : unread ? `Messages, ${unread} unread` : "Messages"}>
          <MessageCircle size={24} strokeWidth={2.2} />
          {targetUser && <span>Message {firstName(targetUser)}</span>}
          {unread > 0 && <em>{unread > 99 ? "99+" : unread}</em>}
        </button>
      )}
      {open && (
        <section className="chat" role="dialog" aria-label="Messages">
          {view.kind === "list" ? (
            <ChatList
              me={me}
              users={users}
              userMap={userMap}
              threads={threads}
              all={all}
              canSeeAll={canSeeAll}
              tab={tab}
              setTab={setTab}
              live={live}
              close={closePanel}
              pick={(email) => enterThread({ kind: "thread", key: email })}
              watch={(p) => enterThread({ kind: "watch", key: p })}
            />
          ) : (
            <Thread
              me={me}
              userMap={userMap}
              view={view}
              convo={convo}
              live={live}
              back={toList}
              close={closePanel}
              send={(text) => send(view.key, text)}
              retry={(m) => send(view.key, m.text, m)}
              older={() => convo && convo.older && loadConvo(view, convo.older)}
            />
          )}
        </section>
      )}
    </>
  );
}

function Status({ live }) {
  return <span className={"chat-live" + (live ? " on" : "")}>{live ? "Live" : "Connecting…"}</span>;
}

function ChatList({ me, users, userMap, threads, all, canSeeAll, tab, setTab, live, close, pick, watch }) {
  const withThread = new Set(threads.map((t) => t.with));
  const rest = users.filter((u) => u.active !== false && u.email !== me.email && !withThread.has(u.email)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <header className="chat-head">
        <div className="chat-title">
          <h2>Messages</h2>
          <Status live={live} />
        </div>
        <button className="chat-x" onClick={close} aria-label="Close messages"><X size={22} /></button>
      </header>
      {canSeeAll && (
        <div className="seg chat-tabs" role="group" aria-label="Which chats">
          <button aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>My chats</button>
          <button aria-pressed={tab === "all"} onClick={() => setTab("all")}>Team chats{all.length ? ` (${all.length})` : ""}</button>
        </div>
      )}
      <div className="chat-scroll">
        {tab === "mine" || !canSeeAll ? (
          <>
            {threads.map((t) => {
              const u = userMap[t.with] || { name: t.with, email: t.with };
              return (
                <button key={t.pair} className={"chat-row" + (t.unread ? " unread" : "")} onClick={() => pick(t.with)}>
                  <Avatar user={u} size={44} />
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <b>{u.name}</b>
                      <small>{shortWhen(t.last && t.last.at)}</small>
                    </span>
                    <span className="chat-row-bottom">
                      <span className="chat-preview">
                        {t.last && t.last.from === me.email && <Tick mine seen={t.seenByThem >= t.last.at} />}
                        {t.last ? t.last.text : ""}
                      </span>
                      {t.unread > 0 && <em>{t.unread}</em>}
                    </span>
                  </span>
                </button>
              );
            })}
            {rest.length > 0 && <h3 className="chat-section">{threads.length ? "Start a new chat" : "Pick someone to message"}</h3>}
            {rest.map((u) => (
              <button key={u.email} className="chat-row" onClick={() => pick(u.email)}>
                <Avatar user={u} size={44} />
                <span className="chat-row-main">
                  <span className="chat-row-top"><b>{u.name}</b></span>
                  <span className="chat-row-bottom"><span className="chat-preview muted">{ROLES[u.role] || ""}</span></span>
                </span>
              </button>
            ))}
          </>
        ) : (
          <>
            <p className="chat-note"><Eye size={14} /> Only you can see these. Nobody is told when you read them.</p>
            {!all.length && <p className="muted chat-empty">No chats between other people yet.</p>}
            {all.map((t) => {
              const a = userMap[t.a] || { name: t.a };
              const b = userMap[t.b] || { name: t.b };
              const by = t.last && (userMap[t.last.from] || {}).name;
              return (
                <button key={t.pair} className="chat-row" onClick={() => watch(t.pair)}>
                  <span className="chat-duo"><Avatar user={a} size={32} /><Avatar user={b} size={32} /></span>
                  <span className="chat-row-main">
                    <span className="chat-row-top">
                      <b>{firstName(a)} & {firstName(b)}</b>
                      <small>{shortWhen(t.last && t.last.at)}</small>
                    </span>
                    <span className="chat-row-bottom"><span className="chat-preview">{by ? `${by.split(" ")[0]}: ` : ""}{t.last ? t.last.text : ""}</span></span>
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

function Tick({ seen, status }) {
  if (status === "sending") return <Clock3 size={13} className="tick" aria-label="Sending" />;
  if (status === "failed") return <AlertCircle size={14} className="tick bad" aria-label="Not sent" />;
  if (seen) return <CheckCheck size={16} className="tick seen" aria-label="Read" />;
  return <Check size={15} className="tick" aria-label="Sent" />;
}

function Thread({ me, userMap, view, convo, live, back, close, send, retry, older }) {
  const watching = view.kind === "watch";
  const [a, b] = watching ? view.key.split("|") : [me.email, view.key];
  const other = userMap[watching ? a : view.key] || { name: view.key, email: view.key };
  const right = watching ? b : me.email; // whose messages sit on the right
  const msgs = (convo && convo.messages) || [];
  const seenAt = (convo && convo.seen && convo.seen[view.key]) || 0;
  const box = useRef(null);
  const atBottom = useRef(true);
  const prevHeight = useRef(0);
  const [pill, setPill] = useState(false);
  const [text, setText] = useState("");
  const input = useRef(null);
  const firstId = msgs.length ? msgs[0].id : "";
  const lastId = msgs.length ? msgs[msgs.length - 1].id : "";

  useLayoutEffect(() => {
    const el = box.current;
    if (el && prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = 0;
    }
  }, [firstId]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !msgs.length) return;
    const last = msgs[msgs.length - 1];
    if (atBottom.current || last.from === me.email) {
      el.scrollTop = el.scrollHeight;
      setPill(false);
    } else setPill(true);
  }, [lastId, msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = box.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    if (atBottom.current) setPill(false);
  };
  const toBottom = () => {
    const el = box.current;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setPill(false);
  };
  const grow = (el) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 132) + "px";
  };
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    send(t);
    setText("");
    atBottom.current = true;
    if (input.current) {
      input.current.style.height = "auto";
      input.current.focus();
    }
  };
  const loadOlder = () => {
    prevHeight.current = box.current ? box.current.scrollHeight : 0;
    older();
  };

  let lastDay = "";
  return (
    <>
      <header className="chat-head">
        <button className="chat-x" onClick={back} aria-label="Back to all chats"><ArrowLeft size={22} /></button>
        {watching ? (
          <span className="chat-duo"><Avatar user={userMap[a] || { name: a }} size={34} /><Avatar user={userMap[b] || { name: b }} size={34} /></span>
        ) : (
          <Avatar user={other} size={38} />
        )}
        <div className="chat-who">
          <b>{watching ? `${firstName(userMap[a])} & ${firstName(userMap[b])}` : other.name}</b>
          <small>{watching ? "Team chat, read only" : ROLES[other.role] || ""}{!live ? " · connecting…" : ""}</small>
        </div>
        <button className="chat-x" onClick={close} aria-label="Close messages"><X size={22} /></button>
      </header>
      <div className="chat-msgs" ref={box} onScroll={onScroll}>
        {convo && convo.older && <button className="chat-older" onClick={loadOlder}>Load earlier messages</button>}
        {!convo || !convo.loaded ? (
          <p className="muted chat-empty">Loading…</p>
        ) : !msgs.length ? (
          <p className="muted chat-empty">{watching ? "No messages yet." : `No messages yet. Say hello to ${firstName(other)}.`}</p>
        ) : null}
        {msgs.map((m, i) => {
          const day = localDay(m.at);
          const showDay = day !== lastDay;
          lastDay = day;
          const prev = msgs[i - 1];
          const first = showDay || !prev || prev.from !== m.from || m.at - prev.at > 5 * 60000;
          const mine = m.from === right;
          return (
            <div key={m.id} className="chat-item">
              {showDay && <div className="chat-day"><span>{dayLabel(m.at)}</span></div>}
              <div className={"bubble-row" + (mine ? " mine" : "") + (first ? " first" : "")}>
                <div className={"bubble" + (m.status === "failed" ? " failed" : "")} onClick={m.status === "failed" ? () => retry(m) : undefined}>
                  {watching && first && <span className="bubble-name">{(userMap[m.from] || { name: m.from }).name}</span>}
                  <span className="bubble-text"><Linked text={m.text} /></span>
                  <span className="bubble-meta">
                    {timeOf(m.at)}
                    {mine && !watching && <Tick status={m.status} seen={seenAt >= m.at} />}
                  </span>
                </div>
              </div>
              {m.status === "failed" && <button className="chat-retry" onClick={() => retry(m)}>Not sent{m.error ? ` (${m.error})` : ""}. Tap to try again.</button>}
            </div>
          );
        })}
      </div>
      {pill && (
        <button className="chat-pill" onClick={toBottom}><ChevronDown size={16} /> New message</button>
      )}
      {watching ? (
        <p className="chat-note foot"><Eye size={14} /> Only you can read this chat. {firstName(userMap[a])} and {firstName(userMap[b])} are not told.</p>
      ) : (
        <form className="chat-compose" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <textarea
            ref={input}
            rows={1}
            value={text}
            maxLength={2000}
            placeholder="Message"
            aria-label={`Message ${other.name}`}
            onChange={(e) => { setText(e.target.value); grow(e.target); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !coarse() && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button type="submit" className="chat-send" disabled={!text.trim()} aria-label="Send" onPointerDown={(e) => e.preventDefault()}>
            <SendHorizontal size={20} />
          </button>
        </form>
      )}
    </>
  );
}
