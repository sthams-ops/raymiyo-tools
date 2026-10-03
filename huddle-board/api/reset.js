import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ADMIN_EMAIL = "mijesh.shrestha@unijoynepal.com";
// ONLY these are ever touched. Logins/sessions and everything else are left alone.
const LIVE_PATTERNS = ["huddle:week:*", "huddle:champion:*"];
const ALLOWED_PREFIXES = ["huddle:week:", "huddle:champion:"];
const STAMP_RE = /^\d{8}T\d{6}Z$/;

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").find((c) => c.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : null;
}
async function getSession(req) {
  const sessionId = getCookie(req, "huddle_session");
  if (!sessionId) return null;
  const raw = await redis.get(`huddle:session:${sessionId}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function scanAll(pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis.scan(cursor, { match: pattern, count: 200 });
    keys.push(...batch);
    cursor = String(next);
  } while (cursor !== "0");
  return keys;
}

async function inBatches(items, size, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return results;
}

// Admin only.
//  GET  /api/reset                         -> what would be archived + existing archives
//  POST {action:"archive", confirm:"START FRESH"}            -> MOVES all weekly data + monthly results into an archive. Nothing is deleted.
//  POST {action:"restore", stamp, confirm:"RESTORE"}         -> moves an archive back (never overwrites newer data)
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Not authenticated" });
    if (session.email !== ADMIN_EMAIL) return res.status(403).json({ error: "Admin only" });

    if (req.method === "GET") {
      const [weeks, champions, archived] = await Promise.all([
        scanAll("huddle:week:*"), scanAll("huddle:champion:*"), scanAll("huddle:archive:*"),
      ]);
      const stamps = {};
      for (const k of archived) {
        const stamp = k.split(":")[2];
        if (STAMP_RE.test(stamp)) stamps[stamp] = (stamps[stamp] || 0) + 1;
      }
      return res.json({
        live: { weeks: weeks.length, champions: champions.length },
        archives: Object.keys(stamps).sort().reverse().map((stamp) => ({ stamp, items: stamps[stamp] })),
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { action, confirm, stamp } = req.body || {};

    if (action === "archive") {
      if (confirm !== "START FRESH") return res.status(400).json({ error: "Type START FRESH to confirm" });
      const newStamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
      const keys = (await Promise.all(LIVE_PATTERNS.map(scanAll))).flat();
      let failed = 0;
      await inBatches(keys, 20, async (k) => {
        const dest = `huddle:archive:${newStamp}:${k}`;
        try { await redis.rename(k, dest); await redis.persist(dest); } catch (e) { failed++; }
      });
      return res.json({ success: true, stamp: newStamp, archived: keys.length - failed, failed });
    }

    if (action === "restore") {
      if (confirm !== "RESTORE") return res.status(400).json({ error: "Type RESTORE to confirm" });
      if (!STAMP_RE.test(String(stamp || ""))) return res.status(400).json({ error: "Invalid archive" });
      const prefix = `huddle:archive:${stamp}:`;
      const keys = await scanAll(`${prefix}*`);
      let restored = 0, skipped = 0;
      await inBatches(keys, 20, async (k) => {
        const orig = k.slice(prefix.length);
        if (!ALLOWED_PREFIXES.some((p) => orig.startsWith(p))) { skipped++; return; }
        try { (await redis.renamenx(k, orig)) === 1 ? restored++ : skipped++; } catch (e) { skipped++; }
      });
      return res.json({ success: true, restored, skipped });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("reset error:", err);
    return res.status(500).json({ error: "Reset failed" });
  }
}
