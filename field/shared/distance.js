// Distance travelled from the phone's GPS route, cleaned the way fitness and
// fleet-tracking apps do before adding it up. Raw GPS is never added as-is:
//   1. Weak fixes are dropped (worse than ±35 m, when the phone said so).
//   2. Spikes are dropped: a point that jumps far away and straight back.
//   3. Teleports are dropped: a jump faster than a scooter can go (70 km/h),
//      unless the next points stay at the new place (then it was real).
//   4. Standing still is one point: GPS wobbles 20–60 m while someone is inside
//      a shop. Points that stay within 50 m of each other become one stop.
// What is left is added up point to point. Points arrive every ~25 m of
// movement, so the line follows the roads closely.
//
// A route is [[lat, lng, seconds, accuracy?], ...] sorted by time.
import { distanceMeters } from "./rules.js";

export const CLEAN = {
  maxAccuracy: 35, // metres
  spikeMeters: 150,
  maxKmh: 70,
  confirmMeters: 150,
  stayMeters: 50,
};

const d = (a, b) => distanceMeters([a[0], a[1]], [b[0], b[1]]);

export function cleanRoute(line) {
  let pts = (line || []).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]));
  pts = pts.slice().sort((a, b) => a[2] - b[2]);
  pts = pts.filter((p) => !(p[3] > CLEAN.maxAccuracy));

  // 2. Spikes: out and straight back.
  let changed = true;
  while (changed && pts.length > 2) {
    changed = false;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const ab = d(a, b);
      const bc = d(b, c);
      if (ab > CLEAN.spikeMeters && bc > CLEAN.spikeMeters && d(a, c) < 0.35 * (ab + bc)) {
        changed = true;
        continue;
      }
      out.push(b);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }

  // 3. Teleports: too fast to be real, unless the following points confirm it.
  const kept = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const last = kept[kept.length - 1];
    if (!last) {
      kept.push(p);
      continue;
    }
    const dist = d(last, p);
    const secs = Math.max(1, p[2] - last[2]);
    if ((dist / secs) * 3.6 > CLEAN.maxKmh && dist > CLEAN.spikeMeters) {
      const next = pts.slice(i + 1, i + 3);
      const confirmed = next.length === 2 && next.every((q) => d(q, p) <= CLEAN.confirmMeters);
      if (!confirmed) continue;
    }
    kept.push(p);
  }

  // 4. Standing still: one point per stop (the middle of it).
  const out = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const lat = group.reduce((t, p) => t + p[0], 0) / group.length;
    const lng = group.reduce((t, p) => t + p[1], 0) / group.length;
    out.push([lat, lng, group[0][2], group[group.length - 1][2]]);
    group = [];
  };
  for (const p of kept) {
    if (!group.length || d(group[0], p) <= CLEAN.stayMeters) group.push(p);
    else {
      flush();
      group.push(p);
    }
  }
  flush();
  return out; // [lat, lng, firstSeconds, lastSeconds]
}

export function routeDistance(line) {
  const pts = cleanRoute(line);
  let m = 0;
  for (let i = 1; i < pts.length; i++) m += d(pts[i - 1], pts[i]);
  return Math.round(m);
}
