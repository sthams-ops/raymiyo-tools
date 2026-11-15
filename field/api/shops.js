// Shops. New shops are created by a check-in (api/visits.js).
//   PATCH  admin corrects a shop: name, type, area, phone, who it belongs to,
//          payment terms, or archives it (active: false).
import { store } from "../lib/store.js";
import { guard, readBody, clean, fail, loadUsers } from "../lib/auth.js";
import { doneVisit } from "../lib/crm.js";
import { phoneKey, findDuplicate } from "../shared/rules.js";

// POST { id, action: "done" }: the shop's owner (or an admin) ticks off what
// the shop was waiting for, for example an order that has been delivered.
async function markDone(req, res) {
  const me = await guard(req, res, ["rep", "admin"]);
  if (!me) return;
  const b = readBody(req);
  const shop = await store.hget("field:shops", String(b.id || ""));
  if (!shop) return res.status(404).json({ error: "That shop was not found." });
  if (me.role === "rep" && shop.owner !== me.email) return res.status(403).json({ error: "This shop belongs to someone else." });
  if (shop.next && shop.next.visitId) {
    const id = String(shop.next.visitId);
    const visit = await store.hget("field:visits:" + id.slice(0, 7), id);
    if (visit) {
      visit.done = true;
      await store.hset("field:visits:" + id.slice(0, 7), id, visit);
      await doneVisit(visit);
    }
  }
  shop.next = null;
  await store.hset("field:shops", shop.id, shop);
  res.json({ shop });
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") return await markDone(req, res);
    if (req.method !== "PATCH") return res.status(405).json({ error: "Method not allowed" });
    const me = await guard(req, res, ["admin"]);
    if (!me) return;
    const b = readBody(req);
    const shop = await store.hget("field:shops", String(b.id || ""));
    if (!shop) return res.status(404).json({ error: "That shop was not found." });

    if (b.name != null) {
      const name = clean(b.name, 80);
      if (!name) return res.status(400).json({ error: "The shop needs a name." });
      shop.name = name;
    }
    if (b.type != null) shop.type = b.type === "Wholesaler" ? "Wholesaler" : "Retailer";
    if (b.area != null) shop.area = clean(b.area, 40);
    if (b.phone != null && clean(b.phone, 20) !== (shop.phone || "")) {
      const phone = phoneKey(b.phone);
      if (!phone) return res.status(400).json({ error: "Enter the shop's phone number. It needs at least 7 digits." });
      const twin = findDuplicate(Object.values(await store.hall("field:shops")), { phone, ignoreId: shop.id });
      if (twin) return res.status(409).json({ error: `That phone number is already saved for ${twin.shop.name}.` });
      shop.phone = phone;
    }
    if (b.terms != null) shop.terms = ["Cash", "Credit (Cheque)"].includes(b.terms) ? b.terms : "";
    if (b.active != null) shop.active = !!b.active;
    if (b.owner != null) {
      const users = await loadUsers();
      const owner = users[String(b.owner).toLowerCase()];
      if (!owner || owner.active === false) return res.status(400).json({ error: "Pick a person from the team list." });
      shop.owner = owner.email;
    }
    await store.hset("field:shops", shop.id, shop);
    res.json({ shop });
  } catch (e) {
    fail(res, e);
  }
}
