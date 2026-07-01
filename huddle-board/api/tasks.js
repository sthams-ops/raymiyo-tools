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

const EMAIL_TO_ID = {
  "sajina@unijoynepal.com": "sajina",
  "divash.shilpakar@unijoynepal.com": "divash",
  "accounts@unijoynepal.com": "manoj",
  "info@unijoynepal.com": "krisha",
  "sunil.shrestha@unijoynepal.com": "sunil",
};

const ADMIN_EMAIL = "mijesh.shrestha@unijoynepal.com";

// weekKey format: YYYY-MM-DD (Monday of that week)
export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const { weekKey } = req.query;
  if (!weekKey || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    return res.status(400).json({ error: "Invalid weekKey" });
  }

  const redisKey = `huddle:week:${weekKey}`;

  // GET — return all tasks for this week
  if (req.method === "GET") {
    const raw = await redis.get(redisKey);
    const data = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    return res.json({ weekKey, data });
  }

  // POST — update tasks
  // Body: { memberId, tasks } where tasks = [{ text, pct }]
  // Admin can update anyone. Members can only update pct on their own tasks.
  if (req.method === "POST") {
    const { memberId, tasks } = req.body || {};
    const isAdmin = session.email === ADMIN_EMAIL;
    const callerMemberId = EMAIL_TO_ID[session.email];

    if (!memberId || !Array.isArray(tasks)) {
      return res.status(400).json({ error: "Invalid body" });
    }

    // Non-admin can only touch their own card
    if (!isAdmin && callerMemberId !== memberId) {
      return res.status(403).json({ error: "Not authorized to edit this member" });
    }

    const raw = await redis.get(redisKey);
    const weekData = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};

    if (!isAdmin) {
      // Non-admin can ONLY change pct — preserve text and structure from existing tasks
      const existing = weekData[memberId] || [];
      const updated = existing.map((task, i) => ({
        ...task,
        pct: tasks[i] !== undefined && typeof tasks[i].pct === "number"
          ? Math.min(100, Math.max(0, Math.round(tasks[i].pct)))
          : task.pct,
      }));
      weekData[memberId] = updated;
    } else {
      // Admin can do anything — add, remove, edit
      weekData[memberId] = tasks.map((t) => ({
        text: String(t.text || "").trim(),
        pct: typeof t.pct === "number" ? Math.min(100, Math.max(0, Math.round(t.pct))) : 0,
        addedAt: t.addedAt || Date.now(),
        ...(t.carriedFrom && { carriedFrom: t.carriedFrom }),
        ...(t.carriedFromPct !== undefined && { carriedFromPct: t.carriedFromPct }),
        ...(t.carryCount !== undefined && { carryCount: t.carryCount }),
      })).filter((t) => t.text.length > 0);
    }

    // Store with 1 year expiry
    await redis.setex(redisKey, 60 * 60 * 24 * 365, JSON.stringify(weekData));
    return res.json({ success: true, data: weekData });
  }

  res.status(405).json({ error: "Method not allowed" });
}
