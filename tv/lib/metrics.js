// Pure helpers (no network). Used by api/metrics.js and covered by tests.

const pad = (n) => String(n).padStart(2, "0");

// "2026-10-05" for right now in Nepal
export function nepalToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function daysIn(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
}

function shiftMonth(y, m, back) {
  let mm = m - back;
  let yy = y;
  while (mm < 1) {
    mm += 12;
    yy -= 1;
  }
  return { y: yy, m: mm };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Three months: [0] = this month, [1] = last month, [2] = the month before.
export function monthRanges(todayYmd) {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const out = [];
  for (let back = 0; back < 3; back++) {
    const s = shiftMonth(y, m, back);
    const days = daysIn(s.y, s.m);
    out.push({
      y: s.y,
      m: s.m,
      days,
      start: `${s.y}-${pad(s.m)}-01`,
      end: `${s.y}-${pad(s.m)}-${pad(days)}`,
      name: MONTH_NAMES[s.m - 1],
      short: MONTH_NAMES[s.m - 1].slice(0, 3),
      key: `${s.y}-${pad(s.m)}`,
    });
  }
  return { today: d, months: out };
}

const round2 = (n) => Math.round(n * 100) / 100;

// rows: [{ Invoice_Date:"2026-09-01", total: 6300, n: 3 }, ...]  (B2C invoices, one row per day)
function salesFor(rows, range, uptoDay) {
  const perDay = new Array(range.days).fill(0);
  const invPerDay = new Array(range.days).fill(0);
  rows.forEach((r) => {
    if (!r || typeof r.Invoice_Date !== "string") return;
    if (r.Invoice_Date.slice(0, 7) !== range.key) return;
    const day = Number(r.Invoice_Date.slice(8, 10));
    if (day >= 1 && day <= range.days) {
      perDay[day - 1] += Number(r.total) || 0;
      invPerDay[day - 1] += Number(r.n) || 0;
    }
  });
  const cum = [];
  let run = 0;
  for (let i = 0; i < range.days; i++) {
    run += perDay[i];
    cum.push(uptoDay && i + 1 > uptoDay ? null : round2(run));
  }
  const last = uptoDay ? Math.min(uptoDay, range.days) : range.days;
  return {
    total: round2(perDay.slice(0, last).reduce((a, b) => a + b, 0)),
    count: invPerDay.slice(0, last).reduce((a, b) => a + b, 0),
    cum,
  };
}

export function buildMetrics({ rows, brows, counts, todayYmd, target }) {
  const { today, months } = monthRanges(todayYmd);
  const [cur, prev, prev2] = months;

  const s0 = salesFor(rows || [], cur, today);
  const s1 = salesFor(rows || [], prev, null);

  const salesBlock = (a, b) => {
    const sameDays = prev.days >= today ? b.cum[today - 1] : b.total;
    return {
      monthName: cur.name,
      prevMonthName: prev.name,
      today,
      daysInMonth: cur.days,
      daysInPrevMonth: prev.days,
      total: a.total,
      count: a.count,
      prevTotal: b.total,
      prevCount: b.count,
      changePct: b.total ? round2(((a.total - b.total) / b.total) * 100) : null,
      sameDaysLast: sameDays === undefined ? null : sameDays,
      paceChangePct: sameDays ? round2(((a.total - sameDays) / sameDays) * 100) : null,
      cum: a.cum,
      prevCum: b.cum,
    };
  };

  const c0 = Number(counts && counts.c0) || 0;
  const c1 = Number(counts && counts.c1) || 0;
  const c2 = Number(counts && counts.c2) || 0;
  const tgt = Number(target) || 30;
  const daysLeft = cur.days - today + 1; // today counts
  const remaining = Math.max(0, tgt - c0);

  const out = {
    sales: salesBlock(s0, s1),
    customers: {
      monthName: cur.name,
      count: c0,
      target: tgt,
      remaining,
      daysLeft,
      perDayNeeded: daysLeft > 0 ? round2(remaining / daysLeft) : 0,
      history: [
        { label: prev2.short, count: c2 },
        { label: prev.short, count: c1 },
        { label: cur.short, count: c0 },
      ],
    },
  };
  if (Array.isArray(brows)) {
    out.b2b = salesBlock(salesFor(brows, cur, today), salesFor(brows, prev, null));
  }
  return out;
}
