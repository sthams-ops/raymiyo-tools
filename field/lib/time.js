// All dates and times in the app are Nepal time (UTC+5:45).
const NEPAL_OFFSET_MINUTES = 345;

export function nepal(d = new Date()) {
  const iso = new Date(d.getTime() + NEPAL_OFFSET_MINUTES * 60000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), month: iso.slice(0, 7) };
}

export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

// The Sunday that starts the week containing this date.
export function weekStart(date) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

// ["2026-10", "2026-11"] for a from/to pair of dates. Capped at 13 months.
export function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  while (out.length < 13) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

// "2026-11-15" plus 3 days -> "2026-11-18".
export function addDays(date, days) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A check-in saved without signal arrives late. The phone sends the moment it
// really happened; it is used when it is not in the future and under a week old.
export function when(at) {
  const t = typeof at === "string" ? Date.parse(at) : NaN;
  const now = Date.now();
  if (!Number.isFinite(t) || t > now + 5 * 60000 || t < now - 7 * 86400000) return new Date(now);
  return new Date(t);
}
