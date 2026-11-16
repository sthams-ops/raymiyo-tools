// Keeps money in step with CRM, at most once every 15 minutes:
//   - payments taken before the Invoice existed are sent again
//   - cheques and promised payments drop off once the Invoice balance is zero
import { store } from "./store.js";
import { crmEnabled, sendPayment, fetchBalances } from "./crm.js";

const GAP = 15 * 60 * 1000;
const key = (id) => "field:visits:" + String(id).slice(0, 7);

export async function settle(force = false) {
  if (!crmEnabled()) return;
  const last = Number(await store.get("field:settled")) || 0;
  if (!force && Date.now() - last < GAP) return;
  await store.set("field:settled", Date.now());
  const shops = Object.values(await store.hall("field:shops")).filter((s) => s && s.dues && s.dues.length);
  const bySo = new Map();
  for (const shop of shops) {
    for (const due of shop.dues) {
      const visit = await store.hget(key(due.visitId), due.visitId);
      if (!visit || !visit.soId) continue;
      if (visit.payCrm === "waiting" || visit.payCrm === "error") {
        const r = await sendPayment(visit);
        if (r.status !== "off") {
          visit.payCrm = r.status;
          visit.payCrmError = r.detail ? String(r.detail).slice(0, 200) : "";
          await store.hset(key(visit.id), visit.id, visit);
        }
      }
      bySo.set(visit.soId, { shop, due });
    }
  }
  if (!bySo.size) return;
  // A dozen orders per round keeps the CRM call quick; the rest follow next time.
  const all = [...bySo.keys()];
  const from = all.length > 12 ? (Number(await store.get("field:settleAt")) || 0) % all.length : 0;
  const pick = all.length > 12 ? [...all.slice(from), ...all.slice(0, from)].slice(0, 12) : all;
  if (all.length > 12) await store.set("field:settleAt", from + 12);
  const balances = await fetchBalances(pick);
  if (!balances) return;
  const changed = new Set();
  for (const [so, { shop, due }] of bySo) {
    if (balances[so] != null && Number(balances[so]) <= 0) {
      shop.dues = shop.dues.filter((d) => d !== due);
      changed.add(shop);
    }
  }
  for (const shop of changed) await store.hset("field:shops", shop.id, shop);
}
