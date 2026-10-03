// Monthly leaderboard logic. Pure functions - no database, no clock (today is always passed in),
// so every rule can be unit-tested.
//
// THE RULES
//  1. A WEEK BELONGS TO ONE MONTH ONLY: the month that holds the week's Wednesday (its 4th of 7 days,
//     i.e. the majority). Same idea as the ISO "Thursday rule" and retail 4-4-5 calendars. No week is
//     ever counted twice and none is left out.
//  2. SCORE = average % over ALL tasks assigned in that month's weeks (every task counts equally),
//     rounded to 1 decimal. The rounded number is the one that is judged and shown.
//  3. ELIGIBLE = score >= ELIGIBILITY_THRESHOLD (50%). Below it you are shown, but you cannot rank or win.
//  4. RANK eligible people by score, then by tasks fully done. Still tied = shared rank / co-winners.
//  5. DECIDED only after the month's LAST WEEK has closed (the Sunday after it - huddle day).
//     Until then the table is "live" and nobody is crowned. Once decided it is stored and never changes.

import { MEMBER_IDS, parseKey, toKey } from "./statsCore.js";

export const ELIGIBILITY_THRESHOLD = 50;
export const LOOKBACK_MONTHS = 12;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");
const round1 = (n) => Math.round(n * 10) / 10;
const clampPct = (v) => Math.min(100, Math.max(0, Number(v) || 0));

export function addDays(key, n) {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}
function diffDays(a, b) { // a - b in days
  return Math.round((parseKey(a) - parseKey(b)) / 86400000);
}

// "YYYY-MM-DD" for today in Nepal, whatever the server/device timezone is
export function nepalToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function isValidMonth(ym) {
  if (typeof ym !== "string" || !/^\d{4}-\d{2}$/.test(ym)) return false;
  const m = Number(ym.slice(5));
  return m >= 1 && m <= 12;
}
export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}
export function monthLabel(ym) {
  return `${MONTH_NAMES[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
}
export function monthShort(ym) {
  return MONTH_NAMES[Number(ym.slice(5)) - 1].slice(0, 3);
}

// RULE 1: the month a week belongs to = the month containing its Wednesday
export function monthOfWeek(weekKey) {
  return addDays(weekKey, 3).slice(0, 7);
}
// All week keys (Sundays) belonging to a month
export function weeksOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const weeks = [];
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCMonth() === m - 1) {
    if (d.getUTCDay() === 3) weeks.push(addDays(toKey(d), -3)); // Wednesday -> that week's Sunday
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return weeks;
}
export function monthWindow(ym) {
  const weeks = weeksOfMonth(ym);
  const firstWeek = weeks[0];
  const lastWeek = weeks[weeks.length - 1];
  return {
    weeks, firstWeek, lastWeek,
    rangeStart: firstWeek,
    rangeEnd: addDays(lastWeek, 6),  // the last Saturday that counts
    decidedOn: addDays(lastWeek, 7), // the Sunday after = first huddle after the month closes
  };
}
// "upcoming" (not started) | "live" (counting) | "final" (decided)
export function monthStatus(ym, today) {
  const w = monthWindow(ym);
  if (today < w.firstWeek) return "upcoming";
  if (today >= w.decidedOn) return "final";
  return "live";
}
// The month that is currently being played. Month N+1 starts on the same day month N is decided.
export function activeMonth(today) {
  const ym = today.slice(0, 7);
  return today < monthWindow(ym).firstWeek ? addMonths(ym, -1) : ym;
}

function personMonth(id, weeks, weeksByKey) {
  let sum = 0, tasks = 0, done = 0, weeksActive = 0;
  const weekly = [];
  for (const wk of weeks) {
    const list = (weeksByKey[wk] || {})[id];
    if (!Array.isArray(list) || list.length === 0) continue;
    let wsum = 0;
    for (const t of list) {
      const p = clampPct(t && t.pct);
      wsum += p; sum += p; tasks++;
      if (p >= 100) done++;
    }
    weeksActive++;
    weekly.push({ weekKey: wk, pct: round1(wsum / list.length) });
  }
  const score = tasks ? round1(sum / tasks) : null;           // RULE 2
  const eligible = score !== null && score >= ELIGIBILITY_THRESHOLD; // RULE 3
  return {
    id, score, tasks, done, weeksActive, weekly, eligible,
    gap: score === null ? ELIGIBILITY_THRESHOLD : eligible ? 0 : round1(ELIGIBILITY_THRESHOLD - score),
  };
}

export function computeMonth(ym, weeksByKey, today) {
  const win = monthWindow(ym);
  const status = monthStatus(ym, today);
  const people = MEMBER_IDS.map((id) => personMonth(id, win.weeks, weeksByKey));

  // RULE 4
  const eligible = people.filter((p) => p.eligible)
    .sort((a, b) => b.score - a.score || b.done - a.done || a.id.localeCompare(b.id));
  eligible.forEach((r, i) => {
    const prev = eligible[i - 1];
    r.rank = prev && prev.score === r.score && prev.done === r.done ? prev.rank : i + 1;
  });
  const notEligible = people.filter((p) => !p.eligible && p.tasks > 0).sort((a, b) => b.score - a.score);
  const noTasks = people.filter((p) => p.tasks === 0).map((p) => p.id);
  const top = eligible.filter((r) => r.rank === 1).map((r) => r.id);

  const strip = (r) => ({ id: r.id, score: r.score, tasks: r.tasks, done: r.done, weeksActive: r.weeksActive, weekly: r.weekly });
  return {
    month: ym,
    label: monthLabel(ym),
    shortLabel: monthShort(ym),
    status,
    threshold: ELIGIBILITY_THRESHOLD,
    window: { weeks: win.weeks, rangeStart: win.rangeStart, rangeEnd: win.rangeEnd, decidedOn: win.decidedOn },
    daysLeft: status === "live" ? Math.max(0, diffDays(win.rangeEnd, today) + 1) : 0,
    rows: eligible.map((r) => ({ ...strip(r), rank: r.rank, rankChange: null })),
    notEligible: notEligible.map((r) => ({ ...strip(r), gap: r.gap })),
    noTasks,
    winners: status === "final" ? top : [],   // RULE 5: nobody is crowned before the month is decided
    leaders: status === "live" ? top : [],
    totals: {
      tasks: people.reduce((s, p) => s + p.tasks, 0),
      done: people.reduce((s, p) => s + p.done, 0),
    },
  };
}

// Movement vs the previous month (+ = moved up). null when they weren't ranked then.
export function withRankChange(month, prevMonth) {
  if (!month) return month;
  const prevRank = {};
  if (prevMonth) for (const r of prevMonth.rows) prevRank[r.id] = r.rank;
  return { ...month, rows: month.rows.map((r) => ({ ...r, rankChange: prevRank[r.id] ? prevRank[r.id] - r.rank : null })) };
}

// { id: {score, eligible, gap, rank, tasks, done, weeksActive} } - used for the chip on each person's card
export function indexByMember(month) {
  const out = {};
  for (const r of month.rows) out[r.id] = { score: r.score, eligible: true, gap: 0, rank: r.rank, tasks: r.tasks, done: r.done, weeksActive: r.weeksActive };
  for (const r of month.notEligible) out[r.id] = { score: r.score, eligible: false, gap: r.gap, rank: null, tasks: r.tasks, done: r.done, weeksActive: r.weeksActive };
  return out;
}

// Orchestration with no I/O: the endpoint fetches the data, this decides everything.
//   records     = already-decided months stored in the database { "YYYY-MM": record }
//   weeksByKey  = raw week data for the months that have no record yet
// Returns null if `requested` is outside the 12-month window.
export function assemble({ today, requested, weeksByKey, records }) {
  const active = activeMonth(today);
  const list = [];
  for (let i = 0; i < LOOKBACK_MONTHS; i++) list.push(addMonths(active, -i)); // newest first

  const computed = {};
  const toFinalize = [];
  for (const ym of list) {
    if (records[ym]) { computed[ym] = records[ym]; continue; }
    const c = computeMonth(ym, weeksByKey, today);
    if (c.status === "final" && c.totals.tasks > 0) {
      const record = { ...c, finalizedAt: new Date().toISOString() };
      toFinalize.push({ ym, record });
      computed[ym] = record;
    } else {
      computed[ym] = c;
    }
  }

  const target = requested || active;
  if (!computed[target]) return null;
  const month = withRankChange(computed[target], computed[addMonths(target, -1)] || null);

  const months = list
    .filter((ym) => ym === active || computed[ym].totals.tasks > 0)
    .map((ym) => {
      const c = computed[ym];
      return {
        ym, label: c.label, shortLabel: c.shortLabel, status: c.status,
        winners: c.winners, score: c.winners.length && c.rows[0] ? c.rows[0].score : null,
      };
    });

  let latestChampion = null;
  for (const ym of list) {
    const c = computed[ym];
    if (c.status === "final" && c.winners.length) {
      latestChampion = { month: ym, label: c.label, shortLabel: c.shortLabel, winners: c.winners, score: c.rows[0].score, decidedOn: c.window.decidedOn };
      break;
    }
  }

  return { today, active, month, months, latestChampion, byMember: indexByMember(computed[active]), toFinalize };
}
