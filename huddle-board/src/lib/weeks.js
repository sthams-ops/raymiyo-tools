// Week helpers for the Huddle Board. A week runs Sunday -> Saturday and is identified by its
// Sunday as "YYYY-MM-DD". All math is done in UTC on plain calendar dates, so it gives the same
// answer on any device (Nepal is UTC+5:45 - local-time math was shifting keys by a day).

const TZ = "Asia/Kathmandu";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export function toKey(date) {
  return date.toISOString().slice(0, 10);
}
export function addWeeks(key, n) {
  const d = parseKey(key);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return toKey(d);
}
export function keyFromYMD(year, monthIndex, day) {
  const p = (n) => String(n).padStart(2, "0");
  return `${year}-${p(monthIndex + 1)}-${p(day)}`;
}
// Sunday on or before the given calendar date
export function weekKeyFor(dateKey) {
  const d = parseKey(dateKey);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toKey(d);
}
// Today's calendar date in Nepal, whatever the device timezone is
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}
export function getWeekKey(now = new Date()) {
  return weekKeyFor(todayKey(now));
}
// 0 = Sunday ... 6 = Saturday, in Nepal time
export function nepalWeekday(now = new Date()) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  return DAY_NAMES.indexOf(name);
}
export function nepalDayName(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(now);
}
export function formatWeekRange(key) {
  const start = parseKey(key);
  const end = parseKey(key);
  end.setUTCDate(end.getUTCDate() + 6);
  const o = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${start.toLocaleDateString("en-US", o)} – ${end.toLocaleDateString("en-US", o)}`;
}
