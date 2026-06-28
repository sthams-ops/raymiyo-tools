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

// Get all Monday week keys for a given YYYY-MM
function getWeeksInMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  // Find first Monday on or before the 1st
  const d = new Date(firstDay);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);

  while (d <= lastDay) {
    // Only include if the week overlaps with this month
    const weekEnd = new Date(d);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd >= firstDay) {
      weeks.push(d.toISOString().split("T")[0]);
    }
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

function calcWeekPct(weekData) {
  if (!weekData) return null;
  const allTasks = Object.values(weekData).flat();
  if (allTasks.length === 0) return null;
  const total = allTasks.reduce((sum, t) => sum + (t.pct || 0), 0);
  return Math.round(total / allTasks.length);
}

// GET /api/months?year=2026
export default async function handler(req, res) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: "Not authenticated" });

  const year = parseInt(req.query.year || new Date().getFullYear(), 10);
  const months = [];

  for (let m = 1; m <= 12; m++) {
    const weekKeys = getWeeksInMonth(year, m);
    const rawValues = await Promise.all(
      weekKeys.map((wk) => redis.get(`huddle:week:${wk}`))
    );

    const weeks = weekKeys.map((wk, i) => {
      const raw = rawValues[i];
      const data = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
      return { weekKey: wk, data, pct: calcWeekPct(data) };
    });

    const weeksWithData = weeks.filter((w) => w.data !== null);
    const monthPct =
      weeksWithData.length > 0
        ? Math.round(
            weeksWithData.reduce((s, w) => s + (w.pct || 0), 0) /
              weeksWithData.length
          )
        : null;

    months.push({
      year,
      month: m,
      monthLabel: new Date(year, m - 1, 1).toLocaleString("en-US", { month: "long" }),
      pct: monthPct,
      weeks,
      hasData: weeksWithData.length > 0,
    });
  }

  return res.json({ year, months });
}
