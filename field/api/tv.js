// Read-only feed for the office TV, which cannot sign in.
// Open the TV at  /tv?key=YOUR_KEY  where the key matches FIELD_TV_KEY on the host.
// Anyone with the link can see today's check-ins and locations, so keep it private.
import crypto from "node:crypto";
import { store } from "../lib/store.js";
import { loadUsers, fail } from "../lib/auth.js";
import { loadSettings, loadVisits, buildBoard, publicUser } from "../lib/data.js";
import { nepal, weekStart, addDays } from "../lib/time.js";
import { loadTracks } from "../lib/track.js";

function sameKey(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async function handler(req, res) {
  try {
    const secret = process.env.FIELD_TV_KEY || "";
    if (secret.length < 12) return res.status(503).json({ error: "The TV link is not set up yet. Add FIELD_TV_KEY (12 or more characters) on the host." });
    if (!sameKey(req.query.key, secret)) return res.status(401).json({ error: "This TV link is not valid." });

    const { date: today, time } = nepal();
    const [users, settings, shops, days, tracks] = await Promise.all([
      loadUsers(),
      loadSettings(),
      store.hall("field:shops"),
      store.hall("field:day:" + today),
      loadTracks(today),
    ]);
    const monthStart = today.slice(0, 7) + "-01";
    const lo = [weekStart(today), monthStart, addDays(today, -1)].sort()[0];
    const all = await loadVisits(lo, today);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      today,
      time,
      settings,
      users: Object.values(users).filter((u) => u.role === "rep").map(publicUser),
      shops: Object.values(shops).map((s) => ({ id: s.id, name: s.name, area: s.area, lat: s.lat, lng: s.lng, active: s.active })),
      visits: all.filter((v) => v.date === today),
      days,
      tracks,
      board: buildBoard(all, users, settings.points, today),
    });
  } catch (e) {
    fail(res, e);
  }
}
