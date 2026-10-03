import assert from "node:assert/strict";
import { computeStats, addWeeks } from "../lib/statsCore.js";
import { weekKeyFor, getWeekKey, addWeeks as addW, nepalWeekday, todayKey, formatWeekRange, keyFromYMD } from "../src/lib/weeks.js";
import { buildLeaderboard } from "../src/lib/leaderboard.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("  ok -", name); };
const task = (pct) => ({ text: "x", pct });
const W = "2026-10-04"; // a Sunday

console.log("TZ =", process.env.TZ);

// ---------- week helpers ----------
t("addWeeks is exact (no off-by-one in any timezone)", () => {
  assert.equal(addW("2026-10-04", 1), "2026-10-11");
  assert.equal(addW("2026-10-04", -1), "2026-09-27");
  assert.equal(addW("2026-12-27", 1), "2027-01-03");
});
t("weekKeyFor returns the Sunday on or before a date", () => {
  assert.equal(weekKeyFor("2026-10-04"), "2026-10-04"); // Sunday itself
  assert.equal(weekKeyFor("2026-10-06"), "2026-10-04"); // Tuesday
  assert.equal(weekKeyFor("2026-10-10"), "2026-10-04"); // Saturday
  assert.equal(weekKeyFor("2026-10-11"), "2026-10-11"); // next Sunday
});
t("calendar click on Oct 6 maps to week 2026-10-04", () => {
  assert.equal(weekKeyFor(keyFromYMD(2026, 9, 6)), "2026-10-04");
});
t("Nepal 1:45am Sunday (= Saturday evening UTC) is already the NEW week", () => {
  const now = new Date("2026-10-03T20:00:00Z"); // 01:45 Sun 4 Oct in Nepal
  assert.equal(todayKey(now), "2026-10-04");
  assert.equal(getWeekKey(now), "2026-10-04");
  assert.equal(nepalWeekday(now), 0);
});
t("Nepal Saturday 11pm is still the OLD week", () => {
  const now = new Date("2026-10-03T17:15:00Z"); // 22:60 -> 23:00 Sat 3 Oct Nepal
  assert.equal(getWeekKey(now), "2026-09-27");
  assert.equal(nepalWeekday(now), 6);
});
t("Wednesday detection", () => {
  assert.equal(nepalWeekday(new Date("2026-10-07T06:00:00Z")), 3);
});
t("formatWeekRange", () => {
  assert.equal(formatWeekRange("2026-10-04"), "Oct 4 – Oct 10");
});

// ---------- stats ----------
t("streak counts consecutive completed 80%+ weeks, stops at first miss", () => {
  const weeks = {
    [addWeeks(W, -1)]: { sajina: [task(100), task(80)] },   // 90
    [addWeeks(W, -2)]: { sajina: [task(85)] },              // 85
    [addWeeks(W, -3)]: { sajina: [task(40)] },              // miss -> stop
    [addWeeks(W, -4)]: { sajina: [task(100)] },
  };
  assert.equal(computeStats(W, weeks).members.sajina.streak, 2);
});
t("a week with no tasks neither extends nor breaks the streak", () => {
  const weeks = {
    [addWeeks(W, -1)]: { sajina: [task(100)] },
    [addWeeks(W, -2)]: { divash: [task(50)] },              // sajina had no tasks
    [addWeeks(W, -3)]: { sajina: [task(90)] },
  };
  assert.equal(computeStats(W, weeks).members.sajina.streak, 2);
});
t("current week is NOT counted in the streak; holding flag shows it is on track", () => {
  const weeks = { [W]: { sajina: [task(100)] } };
  const s = computeStats(W, weeks).members.sajina;
  assert.equal(s.streak, 0);
  assert.equal(s.holding, true);
});
t("consistency = average of last (up to) 4 completed weeks with tasks", () => {
  const weeks = {
    [addWeeks(W, -1)]: { manoj: [task(100)] },
    [addWeeks(W, -2)]: { manoj: [task(50)] },
    [addWeeks(W, -5)]: { manoj: [task(0)] },                // outside the 4-week window
  };
  const s = computeStats(W, weeks).members.manoj;
  assert.equal(s.consistency, 75);
  assert.equal(s.consistencyWeeks, 2);
});
t("winner: highest average last week", () => {
  const weeks = { [addWeeks(W, -1)]: { sajina: [task(90)], divash: [task(60)], manoj: [task(30)] } };
  const lw = computeStats(W, weeks).lastWeek;
  assert.deepEqual(lw.winners, ["sajina"]);
  assert.equal(lw.pct, 90);
});
t("winner tie broken by tasks fully done; still tied -> co-winners", () => {
  const a = { [addWeeks(W, -1)]: { sajina: [task(100), task(0)], divash: [task(50), task(50)] } }; // both 50, sajina has 1 done
  assert.deepEqual(computeStats(W, a).lastWeek.winners, ["sajina"]);
  const b = { [addWeeks(W, -1)]: { sajina: [task(70)], divash: [task(70)] } };
  assert.deepEqual(computeStats(W, b).lastWeek.winners.sort(), ["divash", "sajina"]);
});
t("no winner if only one person had tasks, or everyone is at 0", () => {
  assert.deepEqual(computeStats(W, { [addWeeks(W, -1)]: { sajina: [task(100)] } }).lastWeek.winners, []);
  assert.deepEqual(computeStats(W, { [addWeeks(W, -1)]: { sajina: [task(0)], divash: [task(0)] } }).lastWeek.winners, []);
});
t("empty data never crashes", () => {
  const s = computeStats(W, {});
  assert.equal(s.members.sunil.streak, 0);
  assert.equal(s.members.sunil.consistency, null);
  assert.deepEqual(s.lastWeek.winners, []);
});

// ---------- leaderboard ----------
const TEAM = ["sajina", "divash", "manoj"].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), color: "#fff", gradient: "g" }));
t("leaderboard ranks, shares rank on ties, computes movement vs last month", () => {
  const month = { weeks: [
    { data: { sajina: [task(90)], divash: [task(70)], manoj: [task(70)] } },
    { data: { sajina: [task(80)], divash: [task(70)], manoj: [task(70)] } },
  ] };
  const prev = { weeks: [{ data: { sajina: [task(40)], divash: [task(95)], manoj: [task(60)] } }] };
  const rows = buildLeaderboard(TEAM, month, prev, { sajina: { streak: 3, holding: true } });
  assert.deepEqual(rows.map((r) => [r.id, r.pct, r.rank]), [["sajina", 85, 1], ["divash", 70, 2], ["manoj", 70, 2]]);
  assert.equal(rows[0].moved, 2);   // was 3rd, now 1st
  assert.equal(rows[1].moved, -1);  // was 1st, now 2nd
  assert.equal(rows[0].streak, 3);
});
t("leaderboard with no data is empty, and a missing previous month gives moved = null", () => {
  assert.deepEqual(buildLeaderboard(TEAM, { weeks: [] }, null, null), []);
  const rows = buildLeaderboard(TEAM, { weeks: [{ data: { sajina: [task(50)] } }] }, null, null);
  assert.equal(rows[0].moved, null);
});

console.log(`\nALL ${n} TESTS PASSED`);
