// Live tracking from the Android app: the route each person travels between
// "Start day" and "End day". Nothing is saved outside those hours.
//   field:track:DATE         one entry per person: [[lat, lng, seconds], ...]
//   field:tracktoken:TOKEN   lets the phone send points while the app is in the background
import { store } from "./store.js";
import { nepal } from "./time.js";
import { rid } from "./auth.js";
import { distanceMeters } from "../shared/rules.js";

const TOKEN_SECONDS = 60 * 60 * 24 * 30;
const MAX_POINTS = 3000; // per person per day
const MIN_METERS = 20; // a new point is kept if the person moved this far...
const MIN_SECONDS = 120; // ...or this much time has passed
const MAX_ACCURACY = 150; // metres; worse fixes are thrown away

export async function issueToken(email) {
  const token = rid(32);
  await store.set("field:tracktoken:" + token, { email }, TOKEN_SECONDS);
  return token;
}

export async function emailForToken(token) {
  if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
  const row = await store.get("field:tracktoken:" + token);
  return row ? row.email : null;
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

// Saves the usable points. Answers { tracking, saved }; tracking false tells the
// phone to stop because the day has not started or has ended.
export async function addPoints(email, points) {
  const now = new Date();
  const { date } = nepal(now);
  const dayKey = "field:day:" + date;
  const day = await store.hget(dayKey, email);
  if (!day || !day.start || day.end) return { tracking: false, saved: 0 };

  const nowSec = Math.floor(now.getTime() / 1000);
  const fresh = (Array.isArray(points) ? points : [])
    .slice(0, 500)
    .map((p) => ({ lat: Number(p && p.lat), lng: Number(p && p.lng), t: Math.floor(Number(p && p.t) / 1000), acc: Number(p && p.accuracy) || 0 }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
    .filter((p) => Number.isFinite(p.t) && p.t <= nowSec + 120 && nepal(new Date(p.t * 1000)).date === date)
    .filter((p) => p.acc <= MAX_ACCURACY)
    .sort((a, b) => a.t - b.t);
  if (!fresh.length) return { tracking: true, saved: 0 };

  const key = "field:track:" + date;
  const line = (await store.hget(key, email)) || [];
  let saved = 0;
  for (const p of fresh) {
    const last = line[line.length - 1];
    if (last) {
      if (p.t <= last[2]) continue;
      const moved = distanceMeters([last[0], last[1]], [p.lat, p.lng]);
      if (moved < MIN_METERS && p.t - last[2] < MIN_SECONDS) continue;
    }
    if (line.length >= MAX_POINTS) break;
    line.push([round5(p.lat), round5(p.lng), p.t]);
    saved += 1;
  }
  if (saved) await store.hset(key, email, line);

  // The newest point moves the person's live dot on the map.
  const newest = fresh[fresh.length - 1];
  const at = nepal(new Date(newest.t * 1000)).time;
  await store.hset(dayKey, email, { ...day, lat: newest.lat, lng: newest.lng, at });
  return { tracking: true, saved };
}

export async function loadTracks(date, onlyEmail) {
  const all = await store.hall("field:track:" + date);
  if (!onlyEmail) return all;
  return all[onlyEmail] ? { [onlyEmail]: all[onlyEmail] } : {};
}
