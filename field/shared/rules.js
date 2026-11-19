// Rules shared by the server and the screens, so both always agree.
// Points and brands here are only the starting values: the admin changes
// them inside the app (Settings tab) and the saved values win.

// Who the field user spoke to at the shop.
export const CONTACT_ROLES = ["Owner", "Staff", "Manager"];

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
  dailyVisits: 12,
  reorderDays: 14,
  maxMargin: 30,
  // Travel routes are private: the admin and view-only accounts always see them.
  // A field user sees none unless listed here as "own" (their own route) or "team" (everyone's).
  routeAccess: {},
  tvRoutes: false, // draw routes on the office TV
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
  const whole = (v, lo, hi, d) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && v !== "" && v != null ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const routeAccess = {};
  for (const [email, level] of Object.entries(s.routeAccess && typeof s.routeAccess === "object" ? s.routeAccess : {}).slice(0, 200)) {
    if (level === "own" || level === "team") routeAccess[String(email).toLowerCase().slice(0, 120)] = level;
  }
  return {
    routeAccess,
    tvRoutes: s.tvRoutes === true,
    dailyVisits: whole(s.dailyVisits, 1, 100, DEFAULT_SETTINGS.dailyVisits),
    reorderDays: whole(s.reorderDays, 3, 120, DEFAULT_SETTINGS.reorderDays),
    maxMargin: whole(s.maxMargin, 0, 90, DEFAULT_SETTINGS.maxMargin),
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
    rows.set(person.email, { email: person.email, name: person.name, color: person.color, visits: 0, orders: 0, value: 0, newShops: 0, points: 0, far: 0, days: 0, _d: new Set() });
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
    if (v.far) r.far += 1;
    r._d.add(v.date);
    r.points += visitPoints(v, points);
  }
  for (const r of rows.values()) {
    r.days = r._d.size;
    delete r._d;
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

/* ---------- phones and duplicate shops ---------- */

// Digits only, without the +977 country code. "" when it is not a usable number.
export function phoneKey(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.length > 10 && d.startsWith("977")) d = d.slice(3);
  if (d.length > 10) d = d.slice(-10);
  return d.length >= 7 ? d : "";
}

const nameKey = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(shop|store|stores|pasal|kirana|traders|suppliers|pvt|ltd|and)\b/g, " ").replace(/\s+/g, " ").trim();

// The saved shop a new one would duplicate, or null. Same phone always counts;
// the same name counts when the shop is close by (or its place is unknown).
export function findDuplicate(shops, { name, phone, lat, lng, ignoreId }) {
  const pk = phoneKey(phone);
  const nk = nameKey(name);
  for (const s of shops) {
    if (!s || s.id === ignoreId) continue;
    if (pk && phoneKey(s.phone) === pk) return { shop: s, why: "phone" };
  }
  for (const s of shops) {
    if (!s || s.id === ignoreId || !nk || nameKey(s.name) !== nk) continue;
    const near = lat == null || lng == null || s.lat == null ? true : distanceMeters([lat, lng], [s.lat, s.lng]) <= 400;
    if (near) return { shop: s, why: "name" };
  }
  return null;
}

/* ---------- what to do next ---------- */

export function daysBetween(from, to) {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000);
}

const LEVELS = { overdue: 0, today: 1, push: 2, soon: 3 };
const KIND_ORDER = { deliver: 0, collect: 1, cheque: 2, follow: 3, revisit: 4, reorder: 5, warm: 6, retry: 7 };

// Rupees a shop still owes: unpaid deliveries and cheques not yet cleared.
export const shopOwes = (shop) => (shop.dues || []).reduce((a, d) => a + (d.amount || 0), 0);

// Order maths, the same way CRM does it: list price times quantity, then the
// shop's margin taken off the whole order.
export function orderTotals(items, margin) {
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  const discount = Math.round(subtotal * (Number(margin) || 0)) / 100;
  return { subtotal, discount, total: Math.round((subtotal - discount) * 100) / 100 };
}
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// The to-do list, most urgent first. Each item: { shop, kind, level, title, why, due, late }.
//   level  overdue | today | push | soon
// Pass owner to keep one person's shops only.
export function focusList(shops, today, { owner, reorderDays = DEFAULT_SETTINGS.reorderDays } = {}) {
  const out = [];
  for (const s of shops) {
    if (!s || s.active === false || (owner && s.owner !== owner)) continue;
    const since = s.lastVisit ? daysBetween(s.lastVisit, today) : null;
    // Money first: payments promised for a date, and cheques coming up or late.
    for (const d of s.dues || []) {
      if (!d.date) continue;
      const late = daysBetween(d.date, today);
      if (late < (d.type === "cheque" ? -7 : -3)) continue;
      const level = late > 0 ? "overdue" : late === 0 ? "today" : "soon";
      const when = late > 0 ? `${plural(late, "day")} late` : late === 0 ? "today" : `in ${plural(-late, "day")}`;
      const rs = money(d.amount);
      if (d.type === "cheque") out.push({ shop: s, key: s.id + d.visitId, kind: "cheque", level, title: late >= 0 ? `Cheque of ${rs}: check it has cleared` : `Cheque of ${rs} goes to the bank`, why: when, due: d.date, late, due_: d });
      else out.push({ shop: s, key: s.id + d.visitId, kind: "collect", level, title: `Collect ${rs}`, why: when, due: d.date, late, due_: d });
    }
    const n = s.next;
    if (n && n.due) {
      const late = daysBetween(n.due, today);
      if (late < -3) continue;
      const kind = n.step === "Deliver order" ? "deliver" : n.step === "Revisit" ? "revisit" : "follow";
      const level = late > 0 ? "overdue" : late === 0 ? "today" : "soon";
      const when = late > 0 ? `${plural(late, "day")} late` : late === 0 ? "due today" : `due in ${plural(-late, "day")}`;
      const title = kind === "deliver" ? "Deliver the order" : kind === "revisit" ? "Go back, owner was absent" : "Follow up, they are interested";
      out.push({ shop: s, kind, level, title, why: when, due: n.due, late });
      continue;
    }
    if (since == null) continue;
    if (s.orders >= 1 && since >= reorderDays) {
      out.push({ shop: s, kind: "reorder", level: "push", title: "Ask for a reorder", why: `bought before, no visit for ${plural(since, "day")}`, due: "", late: since - reorderDays });
    } else if (s.orders === 0 && s.stage === "Interested" && since >= 7) {
      out.push({ shop: s, kind: "warm", level: "push", title: "Close the first order", why: `interested, no visit for ${plural(since, "day")}`, due: "", late: since - 7 });
    } else if (s.orders === 0 && since >= 30) {
      out.push({ shop: s, kind: "retry", level: "push", title: "Try this shop again", why: `no visit for ${plural(since, "day")}`, due: "", late: since - 30 });
    }
  }
  return out.sort((a, b) => LEVELS[a.level] - LEVELS[b.level] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.late - a.late || (b.shop.orders || 0) - (a.shop.orders || 0) || a.shop.name.localeCompare(b.shop.name));
}

// Working days from..to, both included. Saturday is the day off.
export function workingDays(from, to) {
  let n = 0;
  for (let t = Date.parse(from + "T00:00:00Z"); t <= Date.parse(to + "T00:00:00Z"); t += 86400000) if (new Date(t).getUTCDay() !== 6) n += 1;
  return n;
}

// One line per field user for the admin: the numbers and what needs a push.
//   rows: scoreboard rows for the period. focus: focusList for all shops.
//   live: the period includes today, which is still running. False for a finished day such as yesterday.
export function coach(rows, focus, { from, today, dailyVisits, todayRows = [], nowTime = "", live = true }) {
  const due = workingDays(from, today);
  const team = rows.reduce((a, r) => ({ visits: a.visits + r.visits, orders: a.orders + r.orders }), { visits: 0, orders: 0 });
  const teamRate = team.visits ? team.orders / team.visits : 0;
  return rows.map((r, i) => {
    const mine = focus.filter((f) => f.shop.owner === r.email);
    const overdue = mine.filter((f) => f.level === "overdue").length;
    const perDay = r.days ? r.visits / r.days : 0;
    const rate = r.visits ? r.orders / r.visits : 0;
    const now = todayRows.find((t) => t.email === r.email) || { visits: 0 };
    const flags = [];
    if (live && nowTime >= "11:30" && new Date(today + "T00:00:00Z").getUTCDay() !== 6 && now.visits === 0) flags.push("No check-in yet today");
    if (r.days < due - (live && now.visits === 0 ? 1 : 0)) flags.push(`In the field ${r.days} of ${plural(due, "working day")}`);
    // Today is still running, so judge the pace on finished days only.
    const running = live ? now.visits : 0;
    const doneDays = r.days - (running > 0 ? 1 : 0);
    const donePace = doneDays > 0 ? (r.visits - running) / doneDays : null;
    if (donePace != null && donePace < dailyVisits * 0.7) flags.push(`Only ${donePace.toFixed(1)} visits a day, target is ${dailyVisits}`);
    if (overdue >= 3) flags.push(`${plural(overdue, "follow-up")} overdue`);
    if (r.visits >= 10 && teamRate > 0 && rate < teamRate * 0.5) flags.push(`Few orders: ${Math.round(rate * 100)}% of visits, team is ${Math.round(teamRate * 100)}%`);
    if (r.far >= 3) flags.push(`${r.far} check-ins far from the shop`);
    const status = flags.length >= 2 ? "push" : flags.length === 1 ? "watch" : i === 0 && r.points > 0 ? "lead" : "ok";
    return { ...r, perDay, rate, overdue, open: mine.length, today: now.visits, flags, status };
  });
}
