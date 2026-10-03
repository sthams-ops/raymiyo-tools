import { Redis } from "@upstash/redis";
import { addWeeks, computeStats, parseKey, toKey, LOOKBACK_WEEKS } from "../lib/statsCore.js";

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

// GET /api/stats?weekKey=YYYY-MM-DD  (any logged-in team member can read)
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Not authenticated" });
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    const weekKey = String(req.query.weekKey || "");
    // Must be a real calendar date (JS would silently roll 2026-13-45 into 2027)
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(weekKey) ? parseKey(weekKey) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || toKey(parsed) !== weekKey) {
      return res.status(400).json({ error: "Invalid weekKey" });
    }

    const keys = [];
    for (let i = -LOOKBACK_WEEKS; i <= 0; i++) keys.push(addWeeks(weekKey, i));
    const raws = await redis.mget(...keys.map((k) => `huddle:week:${k}`));

    const weeksByKey = {};
    keys.forEach((k, i) => {
      const r = raws[i];
      weeksByKey[k] = r ? (typeof r === "string" ? JSON.parse(r) : r) : null;
    });

    return res.json(computeStats(weekKey, weeksByKey));
  } catch (err) {
    console.error("stats error:", err);
    return res.status(500).json({ error: "Could not compute stats" });
  }
}
