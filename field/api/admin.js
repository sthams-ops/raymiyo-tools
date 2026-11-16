// Admin-only changes made from the Team and Settings tabs.
//   POST { op: "saveUser", user: { email, name, role, color, active } }
//   POST { op: "removeUser", email }
//   POST { op: "saveSettings", settings: { points, farMeters, brands } }
import { store } from "../lib/store.js";
import { guard, readBody, clean, fail, loadUsers, DOMAIN, OWNER } from "../lib/auth.js";
import { normalizeSettings, ROLES, COLORS } from "../shared/rules.js";
import { loadProducts } from "../lib/products.js";
import { settle } from "../lib/sync.js";
import { loadVisits } from "../lib/data.js";
import { cancelVisit } from "../lib/crm.js";
import { nepal } from "../lib/time.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const me = await guard(req, res, ["admin"]);
    if (!me) return;
    const b = readBody(req);

    // Removes an archived shop and its check-ins for good. For test or mistaken shops only.
    if (b.op === "deleteShop") {
      const shop = await store.hget("field:shops", String(b.id || ""));
      if (!shop) return res.status(404).json({ error: "That shop was not found." });
      if (shop.active !== false) return res.status(400).json({ error: "Archive the shop first, then delete it." });
      if (shop.dues && shop.dues.length) return res.status(400).json({ error: "This shop still has money to collect. Clear that first." });
      const visits = [];
      for (let y = 2026; y <= Number(nepal().date.slice(0, 4)); y++) {
        visits.push(...(await loadVisits(`${y}-01-01`, `${y}-12-31`)).filter((v) => v.shopId === shop.id));
      }
      for (const v of visits) {
        await store.hdel("field:visits:" + v.date.slice(0, 7), v.id);
        await cancelVisit(v, shop).catch(() => {});
      }
      await store.hdel("field:shops", shop.id);
      return res.json({ ok: true, visits: visits.length });
    }

    if (b.op === "saveUser") {
      const u = b.user || {};
      const email = clean(u.email, 80).toLowerCase();
      if (!/^[a-z0-9._-]+@[a-z0-9.-]+$/.test(email) || !email.endsWith("@" + DOMAIN)) {
        return res.status(400).json({ error: `Use a company email ending in @${DOMAIN}.` });
      }
      const name = clean(u.name, 60);
      if (!name) return res.status(400).json({ error: "Type the person's name." });
      if (!ROLES[u.role]) return res.status(400).json({ error: "Pick a role." });
      if (email === OWNER && (u.role !== "admin" || u.active === false)) {
        return res.status(400).json({ error: "The owner account always stays an active admin." });
      }
      const users = await loadUsers();
      const color = /^#[0-9a-fA-F]{6}$/.test(u.color || "") ? u.color : (users[email] && users[email].color) || COLORS[Object.keys(users).length % COLORS.length];
      const user = { email, name, role: u.role, color, active: u.active !== false };
      await store.hset("field:users", email, user);
      return res.json({ user });
    }

    if (b.op === "removeUser") {
      const email = clean(b.email, 80).toLowerCase();
      if (email === OWNER) return res.status(400).json({ error: "The owner account cannot be removed." });
      if (email === me.email) return res.status(400).json({ error: "You cannot remove yourself." });
      await store.hdel("field:users", email);
      return res.json({ ok: true });
    }

    if (b.op === "saveSettings") {
      const settings = normalizeSettings(b.settings);
      await store.set("field:settings", settings);
      return res.json({ settings });
    }

    if (b.op === "refreshProducts") {
      const fresh = await loadProducts(true);
      if (fresh.error) return res.status(502).json({ error: "Could not read products from CRM: " + fresh.error });
      await settle(true).catch(() => {});
      return res.json({ count: fresh.list.length });
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    fail(res, e);
  }
}
