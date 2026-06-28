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

const ADMIN_EMAIL = "mijesh@unijoynepal.com";

function getNextWeekKey(weekKey) {
  const d = new Date(weekKey + "T00:00:00");
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
}

// POST body: { fromWeek, memberId, taskIndexes }
// Copies selected incomplete tasks to next week (keeping their current pct as starting point)
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });
  if (session.email !== ADMIN_EMAIL) return res.status(403).json({ error: "Admin only" });

  const { fromWeek, memberId, taskIndexes } = req.body || {};
  if (!fromWeek || !memberId || !Array.isArray(taskIndexes)) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const fromKey = `huddle:week:${fromWeek}`;
  const toWeek = getNextWeekKey(fromWeek);
  const toKey = `huddle:week:${toWeek}`;

  const [fromRaw, toRaw] = await Promise.all([
    redis.get(fromKey),
    redis.get(toKey),
  ]);

  const fromData = fromRaw ? (typeof fromRaw === "string" ? JSON.parse(fromRaw) : fromRaw) : {};
  const toData = toRaw ? (typeof toRaw === "string" ? JSON.parse(toRaw) : toRaw) : {};

  const sourceTasks = fromData[memberId] || [];
  const tasksToCarry = taskIndexes
    .filter((i) => i >= 0 && i < sourceTasks.length)
    .map((i) => ({
      ...sourceTasks[i],
      carriedFrom: fromWeek,
      addedAt: Date.now(),
    }));

  if (!toData[memberId]) toData[memberId] = [];
  // Avoid duplicates — check by text
  const existingTexts = new Set(toData[memberId].map((t) => t.text));
  const newTasks = tasksToCarry.filter((t) => !existingTexts.has(t.text));
  toData[memberId] = [...toData[memberId], ...newTasks];

  await redis.setex(toKey, 60 * 60 * 24 * 365, JSON.stringify(toData));

  return res.json({ success: true, toWeek, carried: newTasks.length });
}
