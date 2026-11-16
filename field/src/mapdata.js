// Turns saved data into what the map draws, plus small date helpers.
import { OUTCOMES } from "../shared/rules.js";
import { firstName } from "./ui.jsx";

export const indexBy = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]));

export function weekStartOf(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

export function buildMapData({ visits, shops, users, days, tracks, showShops = true }) {
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
  const routes = Object.entries(tracks || {})
    .filter(([email, line]) => people[email] && Array.isArray(line) && line.length > 1)
    .map(([email, line]) => ({ key: email, color: people[email].color, coords: line.map((p) => [p[1], p[0]]) }));
  return { pins, dots, live, routes };
}

// The day before a "2026-11-16" style date.
export function dayBefore(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
