// Turns saved data into what the map draws, plus small date helpers.
import { cleanRoute, routeDistance } from "../shared/distance.js";
import { OUTCOMES } from "../shared/rules.js";
import { firstName } from "./ui.jsx";

export const indexBy = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]));

export function weekStartOf(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

const clock = (sec) => new Date(sec * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kathmandu" });
const metres = (a, b) => {
  const rad = Math.PI / 180;
  const x = (b[1] - a[1]) * rad * Math.cos(((a[0] + b[0]) / 2) * rad);
  const y = (b[0] - a[0]) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
};

// Distance and times for one person's saved route lines ([[lat, lng, seconds], ...] per day).
// lines: one route per day; extras: that day's check-ins [[lat, lng, seconds], ...] (same order).
// A person's check-ins as accurate route points: [[lat, lng, seconds], ...]. date "" = any day.
export function checkins(visits, email, date) {
  return (visits || [])
    .filter((v) => v.rep === email && (!date || v.date === date) && Number.isFinite(v.lat) && Number.isFinite(v.lng))
    .map((v) => [v.lat, v.lng, Math.floor(Date.parse(`${v.date}T${v.time}:00+05:45`) / 1000)]);
}

export function routeStats(lines, extras = []) {
  let m = 0;
  let first = 0;
  let last = 0;
  let points = 0;
  for (const line of lines) {
    if (!Array.isArray(line) || !line.length) continue;
    points += line.length;
    m += routeDistance(line, extras[lines.indexOf(line)] || []);
    if (!first || line[0][2] < first) first = line[0][2];
    if (line[line.length - 1][2] > last) last = line[line.length - 1][2];
  }
  return { km: Math.round(m / 100) / 10, first: first ? clock(first) : "", last: last ? clock(last) : "", points };
}

// tracks: one day { email: line }. trackDays: several days { date: { email: line } }.
export function buildMapData({ visits, shops, users, days, tracks, trackDays, showShops = true }) {
  const people = indexBy(users, "email");
  const shopsById = indexBy(shops, "id");
  const pins = visits.map((v) => {
    const u = people[v.rep];
    const name = (shopsById[v.shopId] && shopsById[v.shopId].name) || v.shopName;
    return {
      id: v.id,
      lat: v.lat,
      lng: v.lng,
      outcome: v.outcome,
      color: (u && u.color) || "#64748B",
      initial: firstName(u)[0],
      title: `${name}: ${OUTCOMES[v.outcome]}, ${firstName(u)} at ${v.time}`,
    };
  });
  const seen = new Set(visits.map((v) => v.shopId));
  const dots = showShops
    ? shops
        .filter((s) => s.active !== false && !seen.has(s.id) && Number.isFinite(s.lat) && Number.isFinite(s.lng))
        .map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, title: `${s.name}: not visited in these dates` }))
    : [];
  const live = Object.entries(days || {})
    .filter(([email, d]) => d && Number.isFinite(d.lat) && Number.isFinite(d.lng) && people[email])
    .map(([email, d]) => ({
      key: email,
      lat: d.lat,
      lng: d.lng,
      color: people[email].color,
      initial: firstName(people[email])[0],
      label: `${firstName(people[email])} ${d.at}${d.end ? " · day ended" : ""}`,
    }));
  // Routes travelled (Android app live tracking), one coloured line per person.
  const sets = trackDays ? Object.entries(trackDays) : [["", tracks || {}]];
  const routes = [];
  const heat = [];
  for (const [date, set] of sets) {
    for (const [email, line] of Object.entries(set || {})) {
      if (!people[email] || !Array.isArray(line)) continue;
      // The drawn line is the cleaned route: no GPS jumps or rough network spots.
      const drawn = cleanRoute(line, checkins(visits, email, date));
      if (drawn.length > 1) routes.push({ key: email + date, color: people[email].color, coords: drawn.map((p) => [p[1], p[0]]) });
      // Heat follows time, not distance: a point passed while walking is faint,
      // minutes spent in one place add up and glow.
      for (let i = 0; i < line.length; i++) {
        const stay = i + 1 < line.length ? line[i + 1][2] - line[i][2] : 60;
        heat.push([line[i][1], line[i][0], Math.min(1.5, Math.max(0.06, stay / 120))]);
      }
    }
  }
  for (const v of visits) if (Number.isFinite(v.lat) && Number.isFinite(v.lng)) heat.push([v.lng, v.lat, 2]);
  return { pins, dots, live, routes, heat };
}

// The day before a "2026-11-16" style date.
export function dayBefore(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
