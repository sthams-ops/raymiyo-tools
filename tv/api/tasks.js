import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// member id -> display name (must match how the huddle app stores ids)
const NAMES = {
  sajina: "Sajina",
  divash: "Divash",
  manoj: "Manoj",
  krisha: "Krisha",
  sunil: "Sunil",
};

// Date (YYYY-MM-DD) of the Sunday that starts the week containing `d`,
// computed in Nepal time so it flips at the right local moment.
function sundayKey(d = new Date()) {
  const npt = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  npt.setHours(0, 0, 0, 0);
  npt.setDate(npt.getDate() - npt.getDay()); // getDay(): Sun = 0
  const y = npt.getFullYear();
  const m = String(npt.getMonth() + 1).padStart(2, "0");
  const day = String(npt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayKey(d = new Date()) {
  const npt = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kathmandu" }));
  npt.setHours(0, 0, 0, 0);
  const off = npt.getDay() === 0 ? 6 : npt.getDay() - 1;
  npt.setDate(npt.getDate() - off);
  const y = npt.getFullYear();
  const m = String(npt.getMonth() + 1).padStart(2, "0");
  const day = String(npt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function readWeek(key) {
  const raw = await redis.get(`huddle:week:${key}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Try Sunday-start first (the huddle app uses Sunday), fall back to Monday.
    let weekKey = sundayKey();
    let week = await readWeek(weekKey);
    if (!week) {
      const mk = mondayKey();
      const alt = await readWeek(mk);
      if (alt) { week = alt; weekKey = mk; }
    }
    week = week || {};

    const members = [];
    let totalPct = 0;
    let taskCount = 0;

    for (const id of Object.keys(NAMES)) {
      const tasks = Array.isArray(week[id]) ? week[id] : [];
      let sum = 0;
      tasks.forEach((t) => {
        const p = typeof t.pct === "number" ? t.pct : 0;
        sum += p;
        totalPct += p;
        taskCount += 1;
      });
      const avg = tasks.length ? Math.round(sum / tasks.length) : 0;
      members.push({
        id,
        name: NAMES[id],
        avg,
        tasks: tasks.map((t) => ({ text: t.text || "", pct: typeof t.pct === "number" ? t.pct : 0 })),
      });
    }

    const teamScore = taskCount ? Math.round(totalPct / taskCount) : 0;

    return res.status(200).json({ weekKey, teamScore, members });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
