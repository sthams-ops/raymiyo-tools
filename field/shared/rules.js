// Rules shared by the server and the screens, so both always agree.
// Points and brands here are only the starting values: the admin changes
// them inside the app (Settings tab) and the saved values win.

export const OUTCOMES = {
  order: "Order taken",
  interested: "Interested",
  no: "Not interested",
  absent: "Owner absent",
};

// What should happen after each kind of check-in, and how many days later.
// The field user can pick their own follow-up date; these are the defaults.
export const NEXT_STEPS = {
  order: { step: "Deliver order", days: 1 },
  interested: { step: "Follow up", days: 3 },
  absent: { step: "Revisit", days: 2 },
  no: { step: "No action", days: 0 },
};

export const ROLES = {
  admin: "Admin",
  viewer: "Admin, view only",
  rep: "Field user",
};

export const COLORS = ["#0EA5A4", "#7C3AED", "#EC4899", "#2563EB", "#F97316", "#65A30D", "#DC2626", "#0891B2"];

export const DEFAULT_SETTINGS = {
  points: { visit: 1, newShop: 1, firstOrder: 10, repeatOrder: 5 },
  farMeters: 200,
  brands: ["Chicool", "Aiwibi", "Cocobuddy", "Other"],
};

export function normalizeSettings(saved) {
  const s = saved || {};
  const p = { ...DEFAULT_SETTINGS.points, ...(s.points || {}) };
  for (const k of Object.keys(DEFAULT_SETTINGS.points)) {
    const n = Math.round(Number(p[k]));
    p[k] = Number.isFinite(n) ? Math.min(1000, Math.max(0, n)) : DEFAULT_SETTINGS.points[k];
  }
  const far = Math.round(Number(s.farMeters));
  const brands = Array.isArray(s.brands) ? s.brands.map((b) => String(b).trim().slice(0, 30)).filter(Boolean).slice(0, 12) : [];
  return {
    points: p,
    farMeters: Number.isFinite(far) ? Math.min(5000, Math.max(20, far)) : DEFAULT_SETTINGS.farMeters,
    brands: brands.length ? brands : DEFAULT_SETTINGS.brands,
  };
}

// Points for one check-in under the current rules.
export function visitPoints(v, points) {
  let p = points.visit;
  if (v.newShop) p += points.newShop;
  if (v.outcome === "order") p += v.first ? points.firstOrder : points.repeatOrder;
  return p;
}

// One row per person, highest points first.
export function scoreboard(visits, people, points) {
  const rows = new Map();
  for (const person of people) {
    rows.set(person.email, { email: person.email, name: person.name, color: person.color, visits: 0, orders: 0, value: 0, newShops: 0, points: 0 });
  }
  for (const v of visits) {
    const r = rows.get(v.rep);
    if (!r) continue;
    r.visits += 1;
    if (v.outcome === "order") {
      r.orders += 1;
      r.value += v.value || 0;
    }
    if (v.newShop) r.newShops += 1;
    r.points += visitPoints(v, points);
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.value - a.value || a.name.localeCompare(b.name));
}

// Straight-line distance in metres between [lat, lng] pairs.
export function distanceMeters(a, b) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function money(n) {
  return "Rs " + Math.round(Number(n) || 0).toLocaleString("en-IN");
}
