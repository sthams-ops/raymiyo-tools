import { Redis } from "@upstash/redis";
import { assemble, isValidMonth, weeksOfMonth, addMonths, activeMonth, nepalToday, LOOKBACK_MONTHS } from "../lib/monthly.js";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

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
const parse = (r) => (r ? (typeof r === "string" ? JSON.parse(r) : r) : null);

// GET /api/leaderboard            -> the month being played now
// GET /api/leaderboard?month=YYYY-MM -> any month in the last 12
// A month that has just been decided is saved once (first writer wins) and never changes after that.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Not authenticated" });
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const requested = req.query.month ? String(req.query.month) : null;
    if (requested !== null && !isValidMonth(requested)) return res.status(400).json({ error: "Invalid month" });

    const today = nepalToday();
    const list = [];
    for (let i = 0; i < LOOKBACK_MONTHS; i++) list.push(addMonths(activeMonth(today), -i));

    // 1) already-decided months
    const recRaw = await redis.mget(...list.map((ym) => `huddle:champion:${ym}`));
    const records = {};
    list.forEach((ym, i) => { const r = parse(recRaw[i]); if (r) records[ym] = r; });

    // 2) raw weeks only for months that are not decided yet
    const weekKeys = [...new Set(list.filter((ym) => !records[ym]).flatMap(weeksOfMonth))];
    const weeksByKey = {};
    if (weekKeys.length) {
      const raws = await redis.mget(...weekKeys.map((k) => `huddle:week:${k}`));
      weekKeys.forEach((k, i) => { weeksByKey[k] = parse(raws[i]); });
    }

    const out = assemble({ today, requested, weeksByKey, records });
    if (!out) return res.status(400).json({ error: "Month is outside the last 12 months" });

    // 3) lock in months that have just closed (NX = never overwrite an existing result)
    for (const f of out.toFinalize) {
      await redis.set(`huddle:champion:${f.ym}`, JSON.stringify(f.record), { nx: true });
    }
    delete out.toFinalize;
    return res.json(out);
  } catch (err) {
    console.error("leaderboard error:", err);
    return res.status(500).json({ error: "Could not compute leaderboard" });
  }
}
