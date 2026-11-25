// Orders cancelled in CRM come off the field users' sales.
// Every 10 minutes (when the TV or an admin screen asks for data) the server
// asks CRM for the status of this month's and last month's field orders.
// "Cancelled", or a Sales Order deleted in CRM, marks the check-in cancelled:
// it stays in the history but its money and order no longer count.
// If CRM later shows the order as live again, it counts again.
import { store } from "./store.js";
import { nepal } from "./time.js";
import { fetchOrderStatuses, crmEnabled } from "./crm.js";

const EVERY_SECONDS = 600;
const GONE = new Set(["Cancelled", "Deleted"]);
let running = null;

function lastMonth(month) {
  let [y, m] = month.split("-").map(Number);
  m -= 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export async function checkCancellations({ force = false } = {}) {
  if (!crmEnabled()) return { checked: 0, changed: 0 };
  if (!force && (await store.get("field:cancelcheck"))) return { skipped: true };
  await store.set("field:cancelcheck", { at: Date.now() }, EVERY_SECONDS);
  const { month } = nepal();
  let checked = 0;
  let changed = 0;
  for (const m of [lastMonth(month), month]) {
    const group = await store.hall("field:visits:" + m);
    const orders = Object.values(group).filter((v) => v && v.outcome === "order" && v.soId);
    if (!orders.length) continue;
    const statuses = await fetchOrderStatuses(orders.map((v) => v.soId));
    if (!statuses) continue;
    for (const v of orders) {
      const st = statuses[v.soId];
      if (!st) continue;
      checked += 1;
      const gone = GONE.has(st);
      if (!!v.cancelled !== gone || v.soStatus !== st) {
        if (!!v.cancelled !== gone) changed += 1;
        await store.hset("field:visits:" + m, v.id, { ...v, cancelled: gone, soStatus: st });
      }
    }
  }
  return { checked, changed };
}

// Starts a check in the background without making the screen wait for Zoho.
export function checkCancellationsSoon() {
  if (running) return;
  running = checkCancellations()
    .catch((e) => console.error("Cancelled-order check failed:", e.message))
    .finally(() => {
      running = null;
    });
}
