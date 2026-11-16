// The product list for orders. It is read from the CRM Products module and
// kept for a few hours, so names and prices always match CRM.
import { store } from "./store.js";
import { fetchProducts, crmEnabled } from "./crm.js";

const KEY = "field:products";
const MAX_AGE = 6 * 3600 * 1000;

function tidy(list) {
  return list
    .map((p) => ({ id: String(p.id || ""), name: String(p.name || "").trim(), code: String(p.code || ""), category: String(p.category || "Other"), unit: String(p.unit || ""), price: Math.round(Number(p.price) * 100) / 100 }))
    .filter((p) => /^\d+$/.test(p.id) && p.name && p.price > 0)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function loadProducts(force = false) {
  const saved = (await store.get(KEY)) || { at: 0, list: [] };
  if (!crmEnabled()) return saved;
  if (!force && Date.now() - saved.at < MAX_AGE && saved.list.length) return saved;
  const r = await fetchProducts();
  if (r.status !== "ok" || !r.products.length) return { ...saved, error: r.detail || "CRM sent no products." };
  const fresh = { at: Date.now(), list: tidy(r.products) };
  await store.set(KEY, fresh);
  return fresh;
}
