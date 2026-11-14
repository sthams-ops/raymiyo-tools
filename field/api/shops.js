// Shops. New shops are created by a check-in (api/visits.js).
//   PATCH  admin corrects a shop: name, type, area, phone, who it belongs to,
//          payment terms, or archives it (active: false).
import { store } from "../lib/store.js";
import { guard, readBody, clean, fail, loadUsers } from "../lib/auth.js";

export default async function handler(req, res) {
  try {
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
    if (b.phone != null) shop.phone = clean(b.phone, 20);
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
