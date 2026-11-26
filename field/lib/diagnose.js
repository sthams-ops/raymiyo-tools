// One-time report written to the server log (removed after use):
// distance by the old and new methods for the last 3 days, one route in full
// for tuning, and how many field orders have a CRM status.
import { store } from "./store.js";
import { nepal, addDays } from "./time.js";
import { routeDistance } from "../shared/distance.js";
import { distanceMeters } from "../shared/rules.js";
import { checkCancellations } from "./cancels.js";

const raw = (line) => {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += distanceMeters([line[i - 1][0], line[i - 1][1]], [line[i][0], line[i][1]]);
  return m;
};

export async function diagnose() {
  try {
    const { date } = nepal();
    for (let k = 0; k < 3; k++) {
      const day = addDays(date, -k);
      const tracks = await store.hall("field:track:" + day);
      for (const [email, line] of Object.entries(tracks)) {
        if (!Array.isArray(line)) continue;
        const month = day.slice(0, 7);
        const vs = Object.values(await store.hall("field:visits:" + month)).filter((v) => v && v.rep === email && v.date === day);
        const extra = vs.map((v) => [v.lat, v.lng, Math.floor(Date.parse(`${v.date}T${v.time}:00+05:45`) / 1000)]);
        console.log(`DIAG km ${day} ${email.split("@")[0]} points=${line.length} checkins=${vs.length} raw=${(raw(line) / 1000).toFixed(2)} new=${(routeDistance(line) / 1000).toFixed(2)} withCheckins=${(routeDistance(line, extra) / 1000).toFixed(2)}`);
      }
    }
    const t = await store.hall("field:track:2026-11-25");
    for (const [email, line] of Object.entries(t)) {
      if (!email.startsWith("sajina") || !Array.isArray(line)) continue;
      const vs = Object.values(await store.hall("field:visits:2026-11")).filter((v) => v && v.rep === email && v.date === "2026-11-25");
      console.log(`DIAG checkins ${JSON.stringify(vs.map((v) => [v.lat, v.lng, v.time, v.shopName]))}`);
    }
    const r = await checkCancellations({ force: true });
    const m = nepal().month;
    const g = Object.values(await store.hall("field:visits:" + m));
    const orders = g.filter((v) => v && v.outcome === "order");
    const tally = {};
    for (const v of orders) tally[v.soStatus || (v.soId ? "no status yet" : "no CRM order")] = (tally[v.soStatus || (v.soId ? "no status yet" : "no CRM order")] || 0) + 1;
    console.log(`DIAG cancels check=${JSON.stringify(r)} orders=${orders.length} statuses=${JSON.stringify(tally)} cancelled=${orders.filter((v) => v.cancelled).length}`);
  } catch (e) {
    console.log("DIAG failed", e.message);
  }
}
