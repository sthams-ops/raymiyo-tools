import assert from "node:assert/strict";
import {
  monthWindow, monthWeekKeys, monthStatus, activeMonth, addMonths, lastDayOfMonth, isValidMonth, nepalToday,
  computeMonth, withRankChange, indexByMember, assemble, addDays, ELIGIBILITY_THRESHOLD, RULES_VERSION,
} from "../lib/monthly.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ok -", name); };
const task = (pct) => ({ text: "x", pct });
const tasks = (...p) => p.map(task);
const ids = (arr) => arr.map((s) => s.id);

// ---------- calendar months ----------
t("a month is the calendar month: October = Oct 1 to Oct 31, weeks split by days", () => {
  const oct = monthWindow("2026-10");
  assert.equal(oct.start, "2026-10-01"); assert.equal(oct.end, "2026-10-31");
  assert.deepEqual(oct.weeks, [
    { weekKey: "2026-09-27", days: 3 },   // Oct 1-3 of the week Sep 27 - Oct 3
    { weekKey: "2026-10-04", days: 7 }, { weekKey: "2026-10-11", days: 7 },
    { weekKey: "2026-10-18", days: 7 }, { weekKey: "2026-10-25", days: 7 },
  ]);
  assert.deepEqual(monthWindow("2026-09").weeks.map((w) => [w.weekKey, w.days]),
    [["2026-08-30", 5], ["2026-09-06", 7], ["2026-09-13", 7], ["2026-09-20", 7], ["2026-09-27", 4]]);
  assert.deepEqual(monthWeekKeys("2026-10"), ["2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
});
t("EVERY day is counted exactly once, over 3 years of months", () => {
  for (let i = 0; i < 36; i++) {
    const ym = addMonths("2026-01", i);
    const w = monthWindow(ym);
    const length = Number(lastDayOfMonth(ym).slice(8));
    assert.equal(w.weeks.reduce((s, x) => s + x.days, 0), length, `${ym}: days must add up to the month length`);
    w.weeks.forEach((x) => assert.ok(x.days >= 1 && x.days <= 7));
    // a week shared by two months is split so the two parts add to exactly 7
    const prev = monthWindow(addMonths(ym, -1)).weeks.at(-1);
    if (prev.weekKey === w.weeks[0].weekKey) assert.equal(prev.days + w.weeks[0].days, 7, `${ym}: shared week`);
  }
});
t("decided date = the Sunday after the month's last week closes (never before the month ends)", () => {
  const oct = monthWindow("2026-10");
  assert.equal(oct.closesOn, "2026-10-31"); assert.equal(oct.decidedOn, "2026-11-01");
  const sep = monthWindow("2026-09");
  assert.equal(sep.closesOn, "2026-10-03"); assert.equal(sep.decidedOn, "2026-10-04");
  const nov = monthWindow("2026-11");
  assert.equal(nov.end, "2026-11-30"); assert.equal(nov.closesOn, "2026-12-05"); assert.equal(nov.decidedOn, "2026-12-06");
  for (let i = 0; i < 36; i++) { const w = monthWindow(addMonths("2026-01", i)); assert.ok(w.decidedOn > w.end); assert.ok(w.decidedOn <= addDays(w.end, 7)); }
});
t("status: live from the 1st; final only once the last week has closed", () => {
  assert.equal(monthStatus("2026-10", "2026-09-30"), "upcoming");
  assert.equal(monthStatus("2026-10", "2026-10-01"), "live");
  assert.equal(monthStatus("2026-10", "2026-10-31"), "live");
  assert.equal(monthStatus("2026-10", "2026-11-01"), "final");
  assert.equal(monthStatus("2026-09", "2026-10-03"), "live");    // month is over, last week still open
  assert.equal(monthStatus("2026-09", "2026-10-04"), "final");
  assert.equal(monthStatus("2026-11", "2026-12-05"), "live");
  assert.equal(monthStatus("2026-11", "2026-12-06"), "final");
});
t("the board shows the calendar month: on Oct 3 it is October, not September", () => {
  assert.equal(activeMonth("2026-10-03"), "2026-10");
  assert.equal(activeMonth("2026-10-01"), "2026-10");
  assert.equal(activeMonth("2026-09-30"), "2026-09");
  assert.equal(activeMonth("2027-01-01"), "2027-01");
  const sepClosing = computeMonth("2026-09", {}, "2026-10-03");
  assert.equal(sepClosing.status, "live"); assert.equal(sepClosing.ended, true);   // shown as CLOSING
  assert.equal(computeMonth("2026-10", {}, "2026-10-03").ended, false);
});
t("month helpers", () => {
  assert.equal(addMonths("2026-12", 1), "2027-01"); assert.equal(addMonths("2026-01", -1), "2025-12"); assert.equal(addMonths("2026-05", -13), "2025-04");
  assert.equal(lastDayOfMonth("2028-02"), "2028-02-29"); assert.equal(lastDayOfMonth("2026-02"), "2026-02-28");
  assert.ok(isValidMonth("2026-10")); assert.ok(!isValidMonth("2026-13")); assert.ok(!isValidMonth("2026-1")); assert.ok(!isValidMonth(null));
  assert.equal(nepalToday(new Date("2026-10-03T20:00:00Z")), "2026-10-04"); assert.equal(nepalToday(new Date("2026-10-03T17:00:00Z")), "2026-10-03");
});

// ---------- scoring ----------
const OCT = "2026-10";
const LIVE = "2026-10-20";
const FINAL = "2026-11-02";
const wk = (data) => ({ "2026-10-04": data[0] || {}, "2026-10-11": data[1] || {}, "2026-10-18": data[2] || {}, "2026-10-25": data[3] || {} });
const by = (m, id) => m.standings.find((s) => s.id === id);

t("a week that straddles two months is SPLIT BY DAYS between them", () => {
  // week Sep 27 - Oct 3: sajina finished her task (100). Oct 4 week: she did nothing (0).
  const data = { "2026-09-27": { sajina: tasks(100) }, "2026-10-04": { sajina: tasks(0) } };
  assert.equal(by(computeMonth("2026-10", data, "2026-10-20"), "sajina").score, 30);   // (3/7*100 + 1*0) / (3/7 + 1)
  assert.equal(by(computeMonth("2026-09", data, "2026-10-20"), "sajina").score, 100);  // only her 4/7 of that week
});
t("score = weighted average over ALL tasks (every task counts equally), 1 decimal", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(100, 100) }, { sajina: tasks(0) }]), LIVE);
  assert.equal(by(m, "sajina").score, 66.7);   // 200/3, not 50
  assert.equal(by(m, "sajina").tasks, 3); assert.equal(by(m, "sajina").done, 2);
});
t("the 50% bar: exactly 50 is eligible, 49.7 is not (the shown number is the judged number)", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(50), divash: tasks(50, 50, 49), manoj: tasks(49) }]), LIVE);
  assert.deepEqual(ids(m.rows), ["sajina"]);
  assert.equal(by(m, "divash").score, 49.7); assert.equal(by(m, "divash").gap, 0.3); assert.equal(by(m, "divash").eligible, false);
  assert.equal(by(m, "manoj").gap, 1);
  assert.equal(ELIGIBILITY_THRESHOLD, 50);
});
t("EVERYONE is always listed: ranked first, then the people chasing the bar (closest first), then no-tasks-yet", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(90), divash: tasks(30), manoj: tasks(45) }]), LIVE);
  assert.equal(m.standings.length, 5);
  assert.deepEqual(ids(m.standings), ["sajina", "manoj", "divash", "krisha", "sunil"]);
  assert.deepEqual(m.standings.map((s) => s.rank), [1, null, null, null, null]);
  assert.equal(by(m, "krisha").score, null); assert.equal(by(m, "krisha").tasks, 0);
  assert.equal(computeMonth(OCT, {}, LIVE).standings.length, 5);   // even with no data at all
});
t("ranking by score, then tasks fully done; still tied = shared rank / co-winners", () => {
  const a = computeMonth(OCT, wk([{ sajina: tasks(100, 0), divash: tasks(50, 50), manoj: tasks(80, 20) }]), FINAL);
  assert.deepEqual(a.rows.map((r) => [r.id, r.rank]), [["sajina", 1], ["divash", 2], ["manoj", 2]]);
  assert.deepEqual(a.winners, ["sajina"]);
  assert.deepEqual(computeMonth(OCT, wk([{ sajina: tasks(80), divash: tasks(80) }]), FINAL).winners.sort(), ["divash", "sajina"]);
});
t("NOBODY is crowned while the month is live - only once it is decided", () => {
  const data = wk([{ sajina: tasks(90), divash: tasks(70) }]);
  const live = computeMonth(OCT, data, "2026-10-31");
  assert.deepEqual(live.winners, []); assert.deepEqual(live.leaders, ["sajina"]);
  const fin = computeMonth(OCT, data, "2026-11-01");
  assert.deepEqual(fin.winners, ["sajina"]); assert.deepEqual(fin.leaders, []);
});
t("a decided month where nobody reached 50% has no winner, but everyone is still listed", () => {
  const m = computeMonth(OCT, wk([{ sajina: tasks(20), divash: tasks(10) }]), FINAL);
  assert.deepEqual(m.winners, []); assert.equal(m.rows.length, 0); assert.equal(m.standings.length, 5);
});
t("bad data never crashes or inflates (over 100, negative, NaN, missing)", () => {
  const m = computeMonth(OCT, wk([{ sajina: [{ pct: 250 }, { pct: -40 }, { pct: "abc" }, {}, null] }]), LIVE);
  assert.equal(by(m, "sajina").score, 20);
  assert.doesNotThrow(() => computeMonth(OCT, {}, LIVE));
});
t("daysLeft counts today, and is 0 once the month is over or decided", () => {
  assert.equal(computeMonth(OCT, {}, "2026-10-03").daysLeft, 29);
  assert.equal(computeMonth(OCT, {}, "2026-10-31").daysLeft, 1);
  assert.equal(computeMonth(OCT, {}, "2026-11-01").daysLeft, 0);
  assert.equal(computeMonth("2026-09", {}, "2026-10-02").daysLeft, 0);    // closing
  assert.equal(computeMonth(OCT, {}, "2026-09-30").daysLeft, 0);          // upcoming
});

// ---------- recalculated every time: scores and ranks go DOWN as well as up ----------
t("a new task at 0% pulls someone's month score DOWN", () => {
  const w1 = { "2026-10-04": { sajina: tasks(100) } };
  assert.equal(by(computeMonth(OCT, w1, LIVE), "sajina").score, 100);
  const w2 = { ...w1, "2026-10-11": { sajina: tasks(0) } };
  assert.equal(by(computeMonth(OCT, w2, LIVE), "sajina").score, 50);
  const w3 = { ...w2, "2026-10-18": { sajina: tasks(0) } };
  assert.equal(by(computeMonth(OCT, w3, LIVE), "sajina").score, 33.3);
});
t("falling under 50% drops you off the ranking (and the podium) into the chasing group", () => {
  const before = computeMonth(OCT, { "2026-10-04": { sajina: tasks(100), divash: tasks(60) } }, LIVE);
  assert.deepEqual(before.rows.map((r) => r.id), ["sajina", "divash"]);
  const after = computeMonth(OCT, { "2026-10-04": { sajina: tasks(100), divash: tasks(60) }, "2026-10-11": { divash: tasks(0, 0, 0) } }, LIVE);
  assert.equal(by(after, "divash").score, 15); assert.equal(by(after, "divash").rank, null); assert.equal(by(after, "divash").eligible, false);
  assert.deepEqual(after.rows.map((r) => r.id), ["sajina"]);
});
t("overtaking swaps the ranks", () => {
  const a = computeMonth(OCT, { "2026-10-04": { sajina: tasks(90), divash: tasks(70) } }, LIVE);
  assert.deepEqual(a.rows.map((r) => [r.id, r.rank]), [["sajina", 1], ["divash", 2]]);
  const b = computeMonth(OCT, { "2026-10-04": { sajina: tasks(90), divash: tasks(70) }, "2026-10-11": { divash: tasks(100, 100) } }, LIVE);
  assert.deepEqual(b.rows.map((r) => [r.id, r.rank]), [["divash", 1], ["sajina", 2]]);   // divash 90 over 3 tasks, sajina 90 over 1 -> done count decides
});
t("every month starts from zero: another month's tasks never leak in", () => {
  const data = { "2026-09-13": { sajina: tasks(100) }, "2026-11-08": { sajina: tasks(100) } };
  const oct = computeMonth(OCT, data, LIVE);
  assert.equal(by(oct, "sajina").score, null); assert.equal(oct.totals.tasks, 0);
});

// ---------- movement + card index ----------
t("rank change vs the previous month, and the per-person index for the cards", () => {
  const prev = computeMonth("2026-09", { "2026-09-06": { sajina: tasks(60), divash: tasks(90), manoj: tasks(70) } }, "2026-10-10");
  const cur = computeMonth(OCT, wk([{ sajina: tasks(95), divash: tasks(70), manoj: tasks(30) }]), LIVE);
  const r = withRankChange(cur, prev);
  assert.equal(by(r, "sajina").rankChange, 2); assert.equal(by(r, "divash").rankChange, -1); assert.equal(by(r, "manoj").rankChange, null);
  assert.equal(r.rows.find((x) => x.id === "sajina").rankChange, 2);
  assert.equal(withRankChange(cur, null).rows[0].rankChange, null);
  const idx = indexByMember(cur);
  assert.deepEqual(idx.sajina, { score: 95, eligible: true, gap: 0, rank: 1, tasks: 1, done: 0 });
  assert.equal(idx.manoj.eligible, false); assert.equal(idx.manoj.gap, 20); assert.equal(idx.manoj.rank, null);
  assert.equal(idx.krisha.tasks, 0);
});

// ---------- assemble (what the API returns) ----------
const SEP_DATA = { "2026-09-06": { sajina: tasks(90, 80), divash: tasks(60) }, "2026-09-13": { sajina: tasks(100), divash: tasks(70) } };
t("Oct 3: the board shows OCTOBER (everyone listed); September is still closing and is not crowned yet", () => {
  const out = assemble({ today: "2026-10-03", requested: null, weeksByKey: SEP_DATA, records: {} });
  assert.equal(out.active, "2026-10"); assert.equal(out.month.month, "2026-10"); assert.equal(out.month.status, "live");
  assert.equal(out.month.standings.length, 5);
  assert.equal(out.toFinalize.length, 0); assert.equal(out.latestChampion, null);
  const sep = out.months.find((m) => m.ym === "2026-09");
  assert.equal(sep.status, "live"); assert.equal(sep.ended, true);
});
t("Sun Oct 4: September is decided and saved, October carries on", () => {
  const out = assemble({ today: "2026-10-04", requested: null, weeksByKey: SEP_DATA, records: {} });
  assert.equal(out.month.month, "2026-10");
  assert.equal(out.toFinalize.length, 1); assert.equal(out.toFinalize[0].ym, "2026-09"); assert.equal(out.toFinalize[0].replace, false);
  assert.deepEqual(out.latestChampion.winners, ["sajina"]); assert.equal(out.latestChampion.score, 90);
  assert.equal(out.latestChampion.label, "September 2026");
  assert.equal(out.toFinalize[0].record.rules, RULES_VERSION);
});
t("a decided month is FROZEN - later edits cannot change the winner", () => {
  const frozen = { ...computeMonth("2026-09", SEP_DATA, "2026-10-10"), finalizedAt: "x" };
  const tampered = { "2026-09-06": { sajina: tasks(0), divash: tasks(100) } };
  const out = assemble({ today: "2026-10-20", requested: "2026-09", weeksByKey: tampered, records: { "2026-09": frozen } });
  assert.deepEqual(out.month.winners, ["sajina"]); assert.equal(out.toFinalize.length, 0);
});
t("a result saved under OLDER rules is ignored, recomputed and flagged to be replaced", () => {
  const old = { month: "2026-09", winners: ["divash"], rows: [{ id: "divash", score: 99 }], status: "final" };   // no `rules` field
  const out = assemble({ today: "2026-10-20", requested: "2026-09", weeksByKey: SEP_DATA, records: { "2026-09": old } });
  assert.deepEqual(out.month.winners, ["sajina"]);
  assert.equal(out.toFinalize.length, 1); assert.equal(out.toFinalize[0].replace, true);
});
t("out-of-range month is rejected; an empty system is fine; months list only shows months with data", () => {
  assert.equal(assemble({ today: "2026-10-04", requested: "2020-01", weeksByKey: {}, records: {} }), null);
  assert.equal(assemble({ today: "2026-10-04", requested: "2027-03", weeksByKey: {}, records: {} }), null);
  const out = assemble({ today: "2026-10-04", requested: null, weeksByKey: {}, records: {} });
  assert.equal(out.latestChampion, null); assert.deepEqual(out.months.map((m) => m.ym), ["2026-10"]);
  assert.equal(Object.keys(out.byMember).length, 5);
});
t("rank change is computed against the previous month in the same response", () => {
  const records = { "2026-09": { ...computeMonth("2026-09", { "2026-09-06": { sajina: tasks(50), divash: tasks(95) } }, "2026-10-10"), finalizedAt: "x" } };
  const out = assemble({ today: "2026-10-20", requested: "2026-10", weeksByKey: { "2026-10-04": { sajina: tasks(90), divash: tasks(70) } }, records });
  assert.equal(out.month.rows.find((r) => r.id === "sajina").rankChange, 1);
});

console.log(`\nALL ${n} MONTHLY TESTS PASSED`);
