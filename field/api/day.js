// Start of day, end of day and location pings for the signed-in person.
//   POST { action: "start" | "end" | "ping", lat, lng }
import { store } from "../lib/store.js";
import { guard, readBody, fail } from "../lib/auth.js";
import { nepal, when } from "../lib/time.js";
import { replay } from "../lib/idem.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const me = await guard(req, res, ["rep", "admin"]);
    if (!me) return;
    const b = readBody(req);
    if (b.action !== "ping" && (await replay(req, res, b, me.email))) return;
    const lat = Number(b.lat);
    const lng = Number(b.lng);
    if (b.lat == null || b.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: "Your location is missing. Turn on GPS and try again." });
    }
    const { date, time } = nepal(when(b.at));
    const key = "field:day:" + date;
    const day = (await store.hget(key, me.email)) || {};
    if (b.action === "start") {
      day.start = day.start || time;
      day.end = "";
    } else if (b.action === "end") {
      day.start = day.start || time;
      day.end = time;
    } else if (b.action !== "ping") {
      return res.status(400).json({ error: "Unknown action" });
    }
    Object.assign(day, { lat, lng, at: time });
    await store.hset(key, me.email, day);
    res.json({ day });
  } catch (e) {
    fail(res, e);
  }
}
