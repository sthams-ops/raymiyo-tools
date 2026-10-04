// Monthly leaderboard logic. Pure functions - no database, no clock (today is always passed in),
// so every rule can be unit-tested.
//
// THE RULES
//  1. A MONTH IS A CALENDAR MONTH: October = Oct 1 to Oct 31. Every month starts again from zero.
//  2. Tasks live in Sunday-Saturday weeks, and a week can straddle two months (Sep 27 - Oct 3). Such a
//     week is SPLIT BY DAYS: Sep 27-30 is 4/7 of it (counts toward September), Oct 1-3 is 3/7 (counts
//     toward October). Every day is counted exactly once - no week is counted twice or dropped.
//  3. SCORE = weighted average % over every task in the month's weeks (weight = days of that week inside the
//     month / 7), rounded to 1 decimal. The rounded number is the one that is judged and shown.
//  4. ELIGIBLE = score >= 50%. Everyone is always listed with their score; only eligible people get a rank.
//  5. RANK by score, then by tasks fully done. Still tied = shared rank / co-winners.
//  6. DECIDED only after the month's LAST WEEK has closed (the Sunday after it - huddle day). That is 0-6 days
//     after the 31st, so nobody is judged on a half-finished week. Until then the month is LIVE (CLOSING once
//     the calendar month is over) and nobody is crowned. A decided month is stored and never changes.
//  7. Everything is recomputed from the tasks on every request, so scores and ranks go up AND down with the data.

import { MEMBER_IDS, parseKey, toKey } from "./statsCore.js";

export const ELIGIBILITY_THRESHOLD = 50;
export const LOOKBACK_MONTHS = 12;
export const RULES_VERSION = 2; // stored results from older rules are ignored and recomputed

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const clampPct = (v) => Math.min(100, Math.max(0, Number(v) || 0));

export function addDays(key, n) {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}
function diffDays(a, b) { // a - b in days
  return Math.round((parseKey(a) - parseKey(b)) / 86400000);
}
function sundayOf(dateKey) {
  const d = parseKey(dateKey);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toKey(d);
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
export function lastDayOfMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return toKey(new Date(Date.UTC(y, m, 0)));
}

// RULES 1 + 2. weeks = every week that touches the month, with how many of its 7 days fall inside it.
export function monthWindow(ym) {
  const start = `${ym}-01`;
  const end = lastDayOfMonth(ym);
  const weeks = [];
  for (let wk = sundayOf(start); wk <= end; wk = addDays(wk, 7)) {
    const from = wk < start ? start : wk;
    const wkEnd = addDays(wk, 6);
    const to = wkEnd > end ? end : wkEnd;
    weeks.push({ weekKey: wk, days: diffDays(to, from) + 1 });
  }
  const lastWeek = weeks[weeks.length - 1].weekKey;
  return {
    start, end, weeks,
    closesOn: addDays(lastWeek, 6),   // Saturday the last week closes
    decidedOn: addDays(lastWeek, 7),  // RULE 6: the Sunday after = first huddle after it closes
  };
}
export function monthWeekKeys(ym) {
  return monthWindow(ym).weeks.map((w) => w.weekKey);
}
// "upcoming" (not started) | "live" (counting) | "final" (decided)
export function monthStatus(ym, today) {
  const w = monthWindow(ym);
  if (today < w.start) return "upcoming";
  if (today >= w.decidedOn) return "final";
  return "live";
}
// The month being played right now = the calendar month.
export function activeMonth(today) {
  return today.slice(0, 7);
}

function personMonth(id, windowWeeks, weeksByKey) {
  let wsum = 0, wcount = 0, wdone = 0, tasks = 0, done = 0;
  for (const { weekKey, days } of windowWeeks) {
    const list = (weeksByKey[weekKey] || {})[id];
    if (!Array.isArray(list) || list.length === 0) continue;
    const w = days / 7;
    for (const t of list) {
      const p = clampPct(t && t.pct);
      wsum += w * p; wcount += w; tasks++;
      if (p >= 100) { done++; wdone += w; }
    }
  }
  const score = wcount ? round1(wsum / wcount) : null;                 // RULE 3
  const eligible = score !== null && score >= ELIGIBILITY_THRESHOLD;   // RULE 4
  return {
    id, score, tasks, done, doneW: round2(wdone), eligible,
    gap: score === null ? ELIGIBILITY_THRESHOLD : eligible ? 0 : round1(ELIGIBILITY_THRESHOLD - score),
  };
}

export function computeMonth(ym, weeksByKey, today) {
  const win = monthWindow(ym);
  const status = monthStatus(ym, today);
  const people = MEMBER_IDS.map((id) => personMonth(id, win.weeks, weeksByKey));

  // RULE 5
  const ranked = people.filter((p) => p.eligible)
    .sort((a, b) => b.score - a.score || b.doneW - a.doneW || a.id.localeCompare(b.id));
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    r.rank = prev && prev.score === r.score && prev.doneW === r.doneW ? prev.rank : i + 1;
  });
  const chasing = people.filter((p) => !p.eligible && p.tasks > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const idle = people.filter((p) => p.tasks === 0).sort((a, b) => a.id.localeCompare(b.id));

  const pub = (p, rank) => ({ id: p.id, score: p.score, tasks: p.tasks, done: p.done, eligible: p.eligible, gap: p.gap, rank, rankChange: null });
  // EVERYONE is listed: ranked people first, then those chasing the bar (closest first), then those with no tasks yet
  const standings = [
    ...ranked.map((p) => pub(p, p.rank)),
    ...chasing.map((p) => pub(p, null)),
    ...idle.map((p) => pub(p, null)),
  ];
  const top = standings.filter((s) => s.rank === 1).map((s) => s.id);

  return {
    rules: RULES_VERSION,
    month: ym,
    label: monthLabel(ym),
    shortLabel: monthShort(ym),
    status,
    ended: today > win.end,
    threshold: ELIGIBILITY_THRESHOLD,
    window: { start: win.start, end: win.end, weeks: win.weeks, closesOn: win.closesOn, decidedOn: win.decidedOn },
    daysLeft: status === "live" && today <= win.end ? diffDays(win.end, today) + 1 : 0,
    standings,
    rows: standings.filter((s) => s.rank !== null),
    winners: status === "final" ? top : [],   // nobody is crowned before the month is decided
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
  const standings = month.standings.map((s) => ({
    ...s,
    rankChange: s.rank !== null && prevRank[s.id] ? prevRank[s.id] - s.rank : null,
  }));
  return { ...month, standings, rows: standings.filter((s) => s.rank !== null) };
}

// { id: {score, eligible, gap, rank, tasks, done} } - used for the chip on each person's card
export function indexByMember(month) {
  const out = {};
  for (const s of month.standings) {
    out[s.id] = { score: s.score, eligible: s.eligible, gap: s.gap, rank: s.rank, tasks: s.tasks, done: s.done };
  }
  return out;
}

export const isCurrentRecord = (r) => !!r && r.rules === RULES_VERSION;

// Orchestration with no I/O: the endpoint fetches the data, this decides everything.
//   records     = already-decided months stored in the database { "YYYY-MM": record }
//   weeksByKey  = raw week data for the months that have no valid record yet
// Returns null if `requested` is outside the 12-month window.
export function assemble({ today, requested, weeksByKey, records }) {
  const active = activeMonth(today);
  const list = [];
  for (let i = 0; i < LOOKBACK_MONTHS; i++) list.push(addMonths(active, -i)); // newest first

  const computed = {};
  const toFinalize = [];
  for (const ym of list) {
    const existing = records[ym];
    if (isCurrentRecord(existing)) { computed[ym] = existing; continue; }
    const c = computeMonth(ym, weeksByKey, today);
    if (c.status === "final" && c.totals.tasks > 0) {
      const record = { ...c, finalizedAt: new Date().toISOString() };
      toFinalize.push({ ym, record, replace: !!existing }); // replace = an older-rules result is sitting there
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
        ym, label: c.label, shortLabel: c.shortLabel, status: c.status, ended: c.ended,
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
