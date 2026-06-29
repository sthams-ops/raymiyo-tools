import { Redis } from "@upstash/redis";

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

const ADMIN_EMAIL = "mijesh.shrestha@unijoynepal.com";

function getNextWeekKey(weekKey) {
  const d = new Date(weekKey + "T00:00:00");
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (session.email !== ADMIN_EMAIL) return res.status(403).json({ error: "Admin only" });

  const { fromWeek, memberId, taskIndexes, tasksData } = req.body || {};
  if (!fromWeek || !memberId || !Array.isArray(taskIndexes)) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const toWeek = getNextWeekKey(fromWeek);
  const toKey = `huddle:week:${toWeek}`;

  const toRaw = await redis.get(toKey);
  const toData = toRaw ? (typeof toRaw === "string" ? JSON.parse(toRaw) : toRaw) : {};

  if (!toData[memberId]) toData[memberId] = [];

  // Use tasksData if provided (has carry metadata), otherwise fall back
  const tasksToCarry = tasksData || taskIndexes.map(i => ({
    carriedFrom: fromWeek,
    pct: 0,
    carryCount: 1,
    addedAt: Date.now(),
  }));

  // Avoid duplicates by text
  const existingTexts = new Set(toData[memberId].map(t => t.text));
  const newTasks = tasksToCarry.filter(t => t.text && !existingTexts.has(t.text));
  toData[memberId] = [...toData[memberId], ...newTasks];

  await redis.setex(toKey, 60 * 60 * 24 * 365, JSON.stringify(toData));

  return res.json({ success: true, toWeek, carried: newTasks.length });
}
