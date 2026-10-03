import assert from "node:assert/strict";
import {
  weeksOfMonth, monthWindow, monthStatus, activeMonth, addMonths, monthOfWeek, isValidMonth, nepalToday,
  computeMonth, withRankChange, indexByMember, assemble, addDays, ELIGIBILITY_THRESHOLD,
} from "../lib/monthly.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ok -", name); };
const task = (pct) => ({ text: "x", pct });
const tasks = (...p) => p.map(task);

// ---------- calendar rules ----------
t("weeks of a month = the Sundays whose Wednesday is in that month", () => {
  assert.deepEqual(weeksOfMonth("2026-10"), ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
  assert.deepEqual(weeksOfMonth("2026-09"), ["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20", "2026-09-27"]);
});
t("every week belongs to exactly one month - no gaps, no overlaps, over 3 years", () => {
  let prev = null;
  for (let i = 0; i < 36; i++) {
    const ym = addMonths("2026-01", i);
    const w = weeksOfMonth(ym);
    assert.ok(w.length === 4 || w.length === 5, `${ym} has ${w.length} weeks`);
    w.forEach((wk) => assert.equal(monthOfWeek(wk), ym));
    if (prev) assert.equal(addDays(prev, 7), w[0], `gap/overlap before ${ym}`);
    prev = w[w.length - 1];
  }
});
t("window: rangeEnd is the last Saturday counted, decidedOn is the next Sunday", () => {
  const oct = monthWindow("2026-10");
  assert.equal(oct.rangeEnd, "2026-10-31"); assert.equal(oct.decidedOn, "2026-11-01");
  const sep = monthWindow("2026-09");
  assert.equal(sep.rangeEnd, "2026-10-03"); assert.equal(sep.decidedOn, "2026-10-04");
});
t("a month is decided the same day the next one starts", () => {
  assert.equal(monthWindow("2026-09").decidedOn, monthWindow("2026-10").firstWeek);
  assert.equal(monthWindow("2026-12").decidedOn, monthWindow("2027-01").firstWeek);
});
t("status: live until the last week closes, final from the Sunday after", () => {
  assert.equal(monthStatus("2026-09", "2026-10-03"), "live");   // Saturday = last counted day
  assert.equal(monthStatus("2026-09", "2026-10-04"), "final");  // Sunday huddle
  assert.equal(monthStatus("2026-10", "2026-10-03"), "upcoming");
  assert.equal(monthStatus("2026-10", "2026-10-04"), "live");
  assert.equal(monthStatus("2026-10", "2026-11-01"), "final");
});
t("activeMonth hands over exactly on the Sunday", () => {
  assert.equal(activeMonth("2026-09-30"), "2026-09");
  assert.equal(activeMonth("2026-10-03"), "2026-09");
  assert.equal(activeMonth("2026-10-04"), "2026-10");
  assert.equal(activeMonth("2026-11-01"), "2026-11");
  assert.equal(activeMonth("2027-01-01"), "2026-12");
  assert.equal(activeMonth("2027-01-03"), "2027-01");
});
t("month helpers", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2026-05", -13), "2025-04");
  assert.ok(isValidMonth("2026-10")); assert.ok(!isValidMonth("2026-13")); assert.ok(!isValidMonth("2026-1")); assert.ok(!isValidMonth(null));
});
t("nepalToday uses Nepal's date, not the server's", () => {
  assert.equal(nepalToday(new Date("2026-10-03T20:00:00Z")), "2026-10-04"); // 01:45 Sunday in Nepal
  assert.equal(nepalToday(new Date("2026-10-03T17:00:00Z")), "2026-10-03");
});

// ---------- scoring ----------
const OCT = "2026-10";
const TODAY_LIVE = "2026-10-20";
const TODAY_FINAL = "2026-11-02";
const wk = (data) => ({
  "2026-10-04": data[0] || {}, "2026-10-11": data[1] || {}, "2026-10-18": data[2] || {}, "2026-10-25": data[3] || {},
});

t("score = average over ALL tasks (every task counts equally), 1 decimal", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(100, 100) }, { sajina: tasks(0) }]), TODAY_LIVE);
  const s = m.rows.find((r) => r.id === "sajina");
  assert.equal(s.score, 66.7);   // 200/3 - NOT 50 (which a week-by-week average would give)
  assert.equal(s.tasks, 3); assert.equal(s.done, 2); assert.equal(s.weeksActive, 2);
});
t("the 50% bar: exactly 50 is in, 49.7 is out (the shown number is the judged number)", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(50), divash: tasks(50, 50, 49), manoj: tasks(49) }]), TODAY_LIVE);
  assert.deepEqual(m.rows.map((r) => r.id), ["sajina"]);
  const d = m.notEligible.find((r) => r.id === "divash");
  assert.equal(d.score, 49.7); assert.equal(d.gap, 0.3);
  assert.equal(m.notEligible.find((r) => r.id === "manoj").gap, 1);
  assert.equal(ELIGIBILITY_THRESHOLD, 50);
});
t("below the bar you are listed but never ranked", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(90), divash: tasks(30) }]), TODAY_LIVE);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].rank, 1);
  assert.equal(m.notEligible[0].id, "divash");
  assert.deepEqual(m.noTasks.sort(), ["krisha", "manoj", "sunil"]);
});
t("ranking by score, then tasks fully done; still tied = shared rank", () => {
  const a = computeMonth(OCT, wk([{ sajina: tasks(100, 0), divash: tasks(50, 50), manoj: tasks(80, 20) }]), TODAY_FINAL);
  // all three average 50 -> sajina has 1 fully done, others 0
  assert.deepEqual(a.rows.map((r) => [r.id, r.rank]), [["sajina", 1], ["divash", 2], ["manoj", 2]]);
  assert.deepEqual(a.winners, ["sajina"]);
  const b = computeMonth(OCT, wk([{ sajina: tasks(80), divash: tasks(80) }]), TODAY_FINAL);
  assert.deepEqual(b.winners.sort(), ["divash", "sajina"]);
});
t("NOBODY is crowned while the month is live - only after it is decided", () => {
  const data = wk([{ sajina: tasks(90), divash: tasks(70) }]);
  const live = computeMonth(OCT, data, TODAY_LIVE);
  assert.deepEqual(live.winners, []); assert.deepEqual(live.leaders, ["sajina"]); assert.equal(live.status, "live");
  const fin = computeMonth(OCT, data, TODAY_FINAL);
  assert.deepEqual(fin.winners, ["sajina"]); assert.deepEqual(fin.leaders, []); assert.equal(fin.status, "final");
});
t("a decided month where nobody reached 50% has no winner", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(20), divash: tasks(10) }]), TODAY_FINAL);
  assert.deepEqual(m.winners, []); assert.equal(m.rows.length, 0); assert.equal(m.notEligible.length, 2);
});
t("only the month's own weeks count; carried tasks count in the week they are worked", () => {
  const data = {
    "2026-09-27": { sajina: tasks(0) },                                   // belongs to September
    "2026-10-04": { sajina: [{ text: "a", pct: 100, carriedFrom: "2026-09-27", carryCount: 1 }] },
    "2026-11-01": { sajina: tasks(0) },                                   // belongs to November
  };
  const m = computeMonth(OCT, data, TODAY_FINAL);
  assert.equal(m.rows[0].score, 100); assert.equal(m.rows[0].tasks, 1);
});
t("bad data never crashes or inflates (over 100, negative, NaN, missing)", () => {
  const m = computeMonth(OCT, wk([{ sajina: [{ pct: 250 }, { pct: -40 }, { pct: "abc" }, {}, null] }]), TODAY_LIVE);
  assert.equal(m.notEligible[0].score, 20); // (100+0+0+0+0)/5
  assert.doesNotThrow(() => computeMonth(OCT, {}, TODAY_LIVE));
});
t("daysLeft counts today as a day left, 0 once decided or not started", () => {
  assert.equal(computeMonth("2026-09", {}, "2026-10-03").daysLeft, 1);
  assert.equal(computeMonth("2026-09", {}, "2026-09-27").daysLeft, 7);
  assert.equal(computeMonth("2026-09", {}, "2026-10-04").daysLeft, 0);
  assert.equal(computeMonth("2026-10", {}, "2026-10-03").daysLeft, 0);
});
t("rank change vs previous month, and the per-person index for the cards", () => {
  const prev = computeMonth("2026-09", { "2026-09-06": { sajina: tasks(60), divash: tasks(90), manoj: tasks(70) } }, "2026-10-10");
  const cur = computeMonth(OCT, wk([{ sajina: tasks(95), divash: tasks(70), manoj: tasks(30) }]), TODAY_LIVE);
  const r = withRankChange(cur, prev);
  assert.equal(r.rows.find((x) => x.id === "sajina").rankChange, 2);   // 3rd -> 1st
  assert.equal(r.rows.find((x) => x.id === "divash").rankChange, -1);  // 1st -> 2nd
  assert.equal(withRankChange(cur, null).rows[0].rankChange, null);
  const idx = indexByMember(cur);
  assert.deepEqual(idx.sajina, { score: 95, eligible: true, gap: 0, rank: 1, tasks: 1, done: 0, weeksActive: 1 });
  assert.equal(idx.manoj.eligible, false); assert.equal(idx.manoj.gap, 20); assert.equal(idx.manoj.rank, null);
});

// ---------- assemble (what the API returns) ----------
t("assemble: a just-closed month is crowned, queued to be saved, and the new month starts empty", () => {
  const weeksByKey = { "2026-09-06": { sajina: tasks(90), divash: tasks(60) }, "2026-09-13": { sajina: tasks(80) } };
  const out = assemble({ today: "2026-10-04", requested: null, weeksByKey, records: {} });
  assert.equal(out.active, "2026-10");
  assert.equal(out.month.month, "2026-10"); assert.equal(out.month.rows.length, 0);
  assert.equal(out.toFinalize.length, 1); assert.equal(out.toFinalize[0].ym, "2026-09");
  assert.deepEqual(out.latestChampion.winners, ["sajina"]);
  assert.equal(out.latestChampion.label, "September 2026");
  assert.deepEqual(out.months.map((m) => m.ym), ["2026-10", "2026-09"]);
});
t("assemble: a decided month is FROZEN - later edits to old data cannot change the winner", () => {
  const frozen = { ...computeMonth("2026-09", { "2026-09-06": { sajina: tasks(90), divash: tasks(60) } }, "2026-10-10"), finalizedAt: "x" };
  const tampered = { "2026-09-06": { sajina: tasks(0), divash: tasks(100) } };
  const out = assemble({ today: "2026-10-20", requested: "2026-09", weeksByKey: tampered, records: { "2026-09": frozen } });
  assert.deepEqual(out.month.winners, ["sajina"]);
  assert.equal(out.toFinalize.length, 0);
});
t("assemble: before the month closes nothing is saved and nobody is crowned", () => {
  const out = assemble({ today: "2026-10-03", requested: null, weeksByKey: { "2026-09-06": { sajina: tasks(90) } }, records: {} });
  assert.equal(out.active, "2026-09"); assert.equal(out.month.status, "live");
  assert.deepEqual(out.month.winners, []); assert.equal(out.toFinalize.length, 0); assert.equal(out.latestChampion, null);
});
t("assemble: out-of-range month is rejected; empty system is fine", () => {
  assert.equal(assemble({ today: "2026-10-04", requested: "2020-01", weeksByKey: {}, records: {} }), null);
  assert.equal(assemble({ today: "2026-10-04", requested: "2027-03", weeksByKey: {}, records: {} }), null);
  const out = assemble({ today: "2026-10-04", requested: null, weeksByKey: {}, records: {} });
  assert.equal(out.latestChampion, null); assert.deepEqual(out.byMember, {});
});
t("assemble: rank change is computed against the previous month in the same response", () => {
  const records = { "2026-09": { ...computeMonth("2026-09", { "2026-09-06": { sajina: tasks(50), divash: tasks(95) } }, "2026-10-10"), finalizedAt: "x" } };
  const out = assemble({ today: "2026-10-20", requested: "2026-10", weeksByKey: { "2026-10-04": { sajina: tasks(90), divash: tasks(70) } }, records });
  assert.equal(out.month.rows.find((r) => r.id === "sajina").rankChange, 1);
});

console.log(`\nALL ${n} MONTHLY TESTS PASSED`);
