// The day of each field user, worked out for the office TV: how far they went,
// what they sold, where they are now, and anything that looks wrong.
//
// Every check below compares two things the phone reports on its own (the live
// route from the Android app and the GPS of each check-in) or looks at gaps in
// time. A single alert is a question to ask, not proof: a shop can be next
// door, a phone can lose signal. A pattern over several days is what matters.
import { distanceMeters, OUTCOMES } from "./rules.js";

// The numbers behind each alert. Change them here.
export const WATCH = {
  gpsQuietMin: 20, // live location silent this long while the day is running
  gpsQuietHighMin: 45,
  idleMin: 60, // no check-in for this long while the day is running
  idleHighMin: 90,
  stopMin: 30, // stayed in one spot this long...
  stopRadiusM: 120, // ...within this distance...
  stopNearVisitM: 200, // ...and no check-in this close to it
  awayFromPhoneM: 400, // check-in GPS this far from the live route at the same minute
  routeMatchSec: 240, // a route point counts as "the same minute" within this many seconds
  jumpKmh: 60, // faster than this between two check-ins cannot happen in Kathmandu traffic
  jumpMinM: 1000,
  rushCount: 3, // this many check-ins...
  rushMin: 8, // ...inside this many minutes
  togetherM: 250, // two people checking in this close...
  togetherMin: 30, // ...within this many minutes of each other
  startBy: "10:30", // day should be started by
  firstShopBy: "12:00", // first check-in by
  endFrom: "17:00", // ending the day before this is early
  poorFixM: 150, // check-in GPS less precise than this
  workFrom: "10:00", // time checks only run inside working hours
  workTo: "18:30",
};

const LEVEL = { high: 0, mid: 1, low: 2 };
const secOf = (date, time) => Math.floor(Date.parse(`${date}T${time}:00+05:45`) / 1000);
const clockOf = (sec) => new Date((sec + 345 * 60) * 1000).toISOString().slice(11, 16);
const mins = (s) => Math.round(s / 60);
const metres = (a, b) => distanceMeters([a[0], a[1]], [b[0], b[1]]);
const span = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + " min" : ""}`.trim() : `${m} min`);
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

// Distance along a route, leaving out GPS jumps no vehicle could make.
export function routeMetres(line) {
  let m = 0;
  for (let i = 1; i < (line || []).length; i++) {
    const d = metres(line[i - 1], line[i]);
    const dt = Math.max(1, line[i][2] - line[i - 1][2]);
    if ((d / dt) * 3.6 <= 120) m += d;
  }
  return m;
}

// Places a person stayed a long time: [{ lat, lng, from, to }] in seconds.
export function longStops(line, minMin = WATCH.stopMin, radius = WATCH.stopRadiusM) {
  const out = [];
  const pts = line || [];
  let i = 0;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && metres(pts[i], pts[j + 1]) <= radius) j += 1;
    if (pts[j][2] - pts[i][2] >= minMin * 60) {
      out.push({ lat: pts[i][0], lng: pts[i][1], from: pts[i][2], to: pts[j][2] });
      i = j + 1;
    } else i += 1;
  }
  return out;
}

// Where the phone was at a moment, from the live route; null when no point is close in time.
function routeAt(line, sec) {
  let best = null;
  for (const p of line || []) {
    const gap = Math.abs(p[2] - sec);
    if (gap <= WATCH.routeMatchSec && (!best || gap < best.gap)) best = { p, gap };
  }
  return best && best.p;
}

function nearestShop(shops, lat, lng, within = 300) {
  let best = null;
  for (const s of shops) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const d = metres([lat, lng], [s.lat, s.lng]);
    if (d <= within && (!best || d < best.d)) best = { s, d };
  }
  return best && best.s;
}

//   date, nowSec           today and now
//   users                  field users [{ email, name, color }]
//   visits                 today's check-ins
//   days                   { email: { start, end, lat, lng, at, mock } }
//   tracks                 { email: [[lat, lng, sec], ...] }
//   shops                  all shops [{ id, name, area, lat, lng }]
//   dailyVisits            target check-ins per day
export function watchDay({ date, nowSec, users, visits, days = {}, tracks = {}, shops = [], dailyVisits = 12 }) {
  const now = clockOf(nowSec);
  const working = new Date(date + "T00:00:00Z").getUTCDay() !== 6; // Saturday is the day off
  const inHours = working && now >= WATCH.workFrom && now <= WATCH.workTo;
  const shopById = Object.fromEntries(shops.map((s) => [s.id, s]));
  const alerts = [];
  const add = (level, rep, kind, title, detail, at, spot) => alerts.push({ level, rep, kind, title, detail, at: at || "", ...(spot ? { lat: spot[0], lng: spot[1] } : {}) });
  const first = (u) => String(u.name || u.email).split(" ")[0];

  const reps = users.map((u) => {
    const mine = visits.filter((v) => v.rep === u.email).sort((a, b) => a.time.localeCompare(b.time));
    const day = days[u.email] || {};
    const line = (tracks[u.email] || []).slice().sort((a, b) => a[2] - b[2]);
    const name = first(u);
    const orders = mine.filter((v) => v.outcome === "order" && !v.cancelled);
    const metresGone = routeMetres(line);
    const lastVisit = mine[mine.length - 1];
    const lastFix = line.length ? line[line.length - 1][2] : 0;
    const running = !!day.start && !day.end;

    // ---- Where they are right now ----
    let status = { kind: "off", label: "Day not started" };
    if (day.end) status = { kind: "done", label: `Day ended at ${day.end}` };
    else if (running) {
      const sinceVisit = lastVisit ? mins(nowSec - secOf(date, lastVisit.time)) : null;
      const quiet = lastFix ? mins(nowSec - lastFix) : null;
      if (lastVisit && sinceVisit <= 15) status = { kind: "shop", label: `At ${lastVisit.shopName}` };
      else if (quiet != null && quiet >= WATCH.gpsQuietMin) status = { kind: "alert", label: `Location silent ${span(quiet)}` };
      else if (sinceVisit != null && sinceVisit >= WATCH.idleMin) status = { kind: "alert", label: `No check-in for ${span(sinceVisit)}` };
      else status = { kind: "move", label: lastVisit ? `On the move · last shop ${sinceVisit} min ago` : `Started at ${day.start}` };
    }

    // ---- Checks ----
    if (day.mock > 0) add("high", u.email, "mock", `${name}'s phone used a fake-GPS app`, `${day.mock} location points came from a mock location app. Real positions cannot be trusted today.`, day.mockAt);

    if (running && inHours) {
      const startSec = secOf(date, day.start);
      if (!line.length && nowSec - startSec >= WATCH.gpsQuietMin * 60) {
        add("mid", u.email, "notrack", `No live location from ${name}`, `Day started at ${day.start} but the Android app has sent no route. Phone location off, or not using the app.`, day.start);
      } else if (lastFix && nowSec - lastFix >= WATCH.gpsQuietMin * 60) {
        const q = mins(nowSec - lastFix);
        add(q >= WATCH.gpsQuietHighMin ? "high" : "mid", u.email, "quiet", `${name}'s location silent for ${span(q)}`, `Last position at ${clockOf(lastFix)}. Phone off, location turned off, or app closed.`, clockOf(lastFix), line[line.length - 1]);
      }
      const lastAct = lastVisit ? secOf(date, lastVisit.time) : startSec;
      const idle = mins(nowSec - lastAct);
      if (idle >= WATCH.idleMin) add(idle >= WATCH.idleHighMin ? "high" : "mid", u.email, "idle", `${name}: no check-in for ${span(idle)}`, lastVisit ? `Last shop ${lastVisit.shopName} at ${lastVisit.time}.` : `Day started at ${day.start}, no shop yet.`, lastVisit ? lastVisit.time : day.start);
    }

    if (working) {
      if (!day.start && now > WATCH.startBy && now <= WATCH.workTo) add("mid", u.email, "nostart", `${name} has not started the day`, `It is ${now}. Day should start by ${WATCH.startBy}.`, now);
      else if (day.start && day.start > WATCH.startBy) add("low", u.email, "late", `${name} started late at ${day.start}`, `Start by ${WATCH.startBy}.`, day.start);
      if (mine.length && mine[0].time > WATCH.firstShopBy) add("mid", u.email, "latefirst", `${name}'s first shop at ${mine[0].time}`, `Nothing checked in before ${WATCH.firstShopBy}. Ask what the morning was used for.`, mine[0].time);
      else if (!mine.length && day.start && now > WATCH.firstShopBy && now <= WATCH.workTo) add("mid", u.email, "nofirst", `${name}: no shop yet at ${now}`, `Day started at ${day.start}.`, now);
      if (day.end && day.end < WATCH.endFrom) add("mid", u.email, "early", `${name} ended the day at ${day.end}`, `Before ${WATCH.endFrom}.`, day.end);
    }

    // Long stops with no check-in nearby.
    for (const st of longStops(line)) {
      const visited = mine.some((v) => {
        const t = secOf(date, v.time);
        return t >= st.from - 600 && t <= st.to + 600 && metres([v.lat, v.lng], [st.lat, st.lng]) <= WATCH.stopNearVisitM;
      });
      if (visited) continue;
      const near = nearestShop(shops, st.lat, st.lng);
      const where = near ? `near ${near.name}` : "at a place that is not a shop";
      add("mid", u.email, "stop", `${name} stayed ${span(mins(st.to - st.from))} with no check-in`, `${clockOf(st.from)}–${clockOf(st.to)}, ${where}.`, clockOf(st.from), [st.lat, st.lng]);
    }

    // Each check-in against the phone's own route, and against the one before.
    const seen = new Map();
    let rushUntil = -1;
    mine.forEach((v, i) => {
      const t = secOf(date, v.time);
      const at = routeAt(line, t);
      if (at) {
        const d = metres([v.lat, v.lng], at);
        if (d >= WATCH.awayFromPhoneM) add("high", u.email, "away", `${v.shopName}: check-in ${km(d)} from ${name}'s phone`, `At ${v.time} the live route had ${name} somewhere else. The check-in location may be faked.`, v.time, [v.lat, v.lng]);
      }
      if (v.far) add("mid", u.email, "far", `${v.shopName}: checked in ${km(v.distance)} from the shop`, `The shop is saved at another spot.`, v.time, [v.lat, v.lng]);
      if (v.accuracy > WATCH.poorFixM) add("low", u.email, "fix", `${v.shopName}: weak GPS (±${v.accuracy} m)`, `Location could not be confirmed well.`, v.time);
      if (seen.has(v.shopId)) add("mid", u.email, "twice", `${v.shopName} checked in twice`, `At ${seen.get(v.shopId)} and ${v.time}. Extra check-ins add points.`, v.time);
      seen.set(v.shopId, v.time);
      const prev = mine[i - 1];
      if (prev) {
        const d = metres([prev.lat, prev.lng], [v.lat, v.lng]);
        const dt = Math.max(60, t - secOf(date, prev.time));
        if (d >= WATCH.jumpMinM && (d / dt) * 3.6 > WATCH.jumpKmh) add("high", u.email, "jump", `${name} moved ${km(d)} in ${mins(dt)} min`, `${prev.shopName} (${prev.time}) to ${v.shopName} (${v.time}). Too fast to be real.`, v.time, [v.lat, v.lng]);
      }
      const later = mine.slice(i).filter((w) => secOf(date, w.time) - t <= WATCH.rushMin * 60);
      if (i > rushUntil && later.length >= WATCH.rushCount) {
        rushUntil = i + later.length - 1;
        add("mid", u.email, "rush", `${name}: ${later.length} check-ins in ${WATCH.rushMin} min`, `${later.map((w) => w.shopName).join(", ")}. Too quick for real conversations.`, v.time);
      }
    });
    const noPhoto = mine.filter((v) => !v.photo).length;
    if (noPhoto) add("low", u.email, "photo", `${name}: ${noPhoto} check-in${noPhoto > 1 ? "s" : ""} without a shelf photo`, "", "");

    const out = {
      email: u.email,
      name: u.name,
      color: u.color,
      status,
      start: day.start || "",
      end: day.end || "",
      metres: Math.round(metresGone),
      tracked: line.length > 0,
      visits: mine.length,
      target: dailyVisits,
      orders: orders.length,
      amount: orders.reduce((t, v) => t + (v.value || 0), 0),
      newShops: mine.filter((v) => v.newShop).length,
      firstOrders: orders.filter((v) => v.first).length,
      firstAt: mine.length ? mine[0].time : "",
      lastAt: lastVisit ? lastVisit.time : "",
      lastShop: lastVisit ? lastVisit.shopName : "",
      outcomes: Object.fromEntries(Object.keys(OUTCOMES).map((k) => [k, mine.filter((v) => v.outcome === k).length])),
    };
    return out;
  });

  // Two people working the same streets halves the ground covered.
  for (let a = 0; a < users.length; a++) {
    for (let b = a + 1; b < users.length; b++) {
      const A = visits.filter((v) => v.rep === users[a].email);
      const B = visits.filter((v) => v.rep === users[b].email);
      const pairs = A.filter((v) => B.some((w) => Math.abs(secOf(date, v.time) - secOf(date, w.time)) <= WATCH.togetherMin * 60 && metres([v.lat, v.lng], [w.lat, w.lng]) <= WATCH.togetherM));
      if (pairs.length >= 2) {
        const areas = [...new Set(pairs.map((v) => (shopById[v.shopId] && shopById[v.shopId].area) || v.area).filter(Boolean))].slice(0, 3);
        add(pairs.length >= 3 ? "mid" : "low", users[a].email, "together", `${first(users[a])} and ${first(users[b])} are working the same streets`, `${pairs.length} check-ins within ${WATCH.togetherM} m of each other${areas.length ? " in " + areas.join(", ") : ""}. Split the areas to cover more shops.`, pairs[pairs.length - 1].time);
      }
    }
  }

  alerts.sort((x, y) => LEVEL[x.level] - LEVEL[y.level] || String(y.at).localeCompare(String(x.at)));
  const team = reps.reduce((t, r) => ({ visits: t.visits + r.visits, orders: t.orders + r.orders, amount: t.amount + r.amount, metres: t.metres + r.metres, newShops: t.newShops + r.newShops }), { visits: 0, orders: 0, amount: 0, metres: 0, newShops: 0 });
  return { now, reps, alerts, team };
}
