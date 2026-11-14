// Check-ins.
//   POST    save a new check-in (field users and admin). GPS is required.
//   PATCH   correct a check-in (admin only)
//   DELETE  remove a check-in (admin only)
import { store } from "../lib/store.js";
import { guard, readBody, clean, fail, rid } from "../lib/auth.js";
import { loadSettings, stageFor } from "../lib/data.js";
import { nepal } from "../lib/time.js";
import { syncVisit } from "../lib/crm.js";
import { OUTCOMES, distanceMeters } from "../shared/rules.js";

const TERMS = ["Cash", "Credit (Cheque)"];
const bad = (res, msg) => res.status(400).json({ error: msg });

function readOrder(b, res) {
  if (b.outcome !== "order") return { value: 0, terms: "" };
  const value = Math.round(Number(b.value));
  if (!(value > 0) || value > 100000000) {
    bad(res, "Enter the order amount in rupees.");
    return null;
  }
  return { value, terms: TERMS.includes(b.terms) ? b.terms : "Cash" };
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") return await create(req, res);
    if (req.method === "PATCH") return await update(req, res);
    if (req.method === "DELETE") return await remove(req, res);
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    fail(res, e);
  }
}

async function create(req, res) {
  const me = await guard(req, res, ["rep", "admin"]);
  if (!me) return;
  const b = readBody(req);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  if (b.lat == null || b.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return bad(res, "Your location is missing. Turn on GPS and try again.");
  }
  if (!OUTCOMES[b.outcome]) return bad(res, "Pick what happened at the shop.");
  const order = readOrder(b, res);
  if (!order) return;

  const settings = await loadSettings();
  const { date, time, month } = nepal();
  let shop;
  let newShop = false;
  if (b.shopId) {
    shop = await store.hget("field:shops", String(b.shopId));
    if (!shop || shop.active === false) return res.status(404).json({ error: "That shop was not found. Refresh and try again." });
  } else {
    const name = clean(b.shopName, 80);
    if (!name) return bad(res, "Type the shop name.");
    shop = {
      id: "s_" + rid(6),
      name,
      type: b.shopType === "Wholesaler" ? "Wholesaler" : "Retailer",
      area: clean(b.area, 40),
      phone: clean(b.phone, 20),
      lat,
      lng,
      owner: me.email,
      orders: 0,
      stage: "Prospect",
      terms: "",
      active: true,
      createdBy: me.email,
      createdAt: date,
    };
    newShop = true;
  }

  const distance = newShop ? 0 : distanceMeters([lat, lng], [shop.lat, shop.lng]);
  const brands = Array.isArray(b.brands) ? b.brands.map((x) => clean(x, 30)).filter((x) => settings.brands.includes(x)) : [];
  const photo = typeof b.photo === "string" && /^https:\/\/[^\s]+$/.test(b.photo) ? b.photo.slice(0, 400) : "";
  const visit = {
    id: `${date}-${rid(5)}`,
    date,
    time,
    rep: me.email,
    shopId: shop.id,
    shopName: shop.name,
    area: shop.area,
    outcome: b.outcome,
    value: order.value,
    terms: order.terms,
    brands,
    note: clean(b.note, 500),
    photo,
    lat,
    lng,
    accuracy: Math.round(Number(b.accuracy)) || 0,
    distance,
    far: distance > settings.farMeters,
    newShop,
    first: false,
    crm: "off",
  };
  if (visit.outcome === "order") {
    visit.first = shop.orders === 0;
    shop.orders += 1;
    shop.terms = order.terms;
  }
  shop.lastVisit = date;
  shop.stage = stageFor(shop, visit.outcome);

  await store.hset("field:shops", shop.id, shop);
  await store.hset("field:visits:" + month, visit.id, visit);

  const day = (await store.hget("field:day:" + date, me.email)) || { start: time };
  await store.hset("field:day:" + date, me.email, { ...day, end: "", lat, lng, at: time });

  const sync = await syncVisit(visit, shop, me);
  if (sync.status !== "off") {
    visit.crm = sync.status;
    if (sync.detail) visit.crmError = clean(sync.detail, 200);
    if (sync.visitCrmId) visit.crmId = sync.visitCrmId;
    await store.hset("field:visits:" + month, visit.id, visit);
    if (sync.accountCrmId && !shop.crmId) {
      shop.crmId = sync.accountCrmId;
      await store.hset("field:shops", shop.id, shop);
    }
  }
  res.json({ visit, shop });
}

async function find(id) {
  const key = "field:visits:" + String(id || "").slice(0, 7);
  if (!/^\d{4}-\d{2}-\d{2}-[a-f0-9]+$/.test(String(id || ""))) return {};
  return { key, visit: await store.hget(key, id) };
}

async function update(req, res) {
  const me = await guard(req, res, ["admin"]);
  if (!me) return;
  const b = readBody(req);
  const { key, visit } = await find(b.id);
  if (!visit) return res.status(404).json({ error: "That check-in was not found." });
  if (!OUTCOMES[b.outcome]) return bad(res, "Pick what happened at the shop.");
  const order = readOrder(b, res);
  if (!order) return;

  const shop = await store.hget("field:shops", visit.shopId);
  if (shop) {
    const was = visit.outcome === "order";
    const now = b.outcome === "order";
    if (was && !now) shop.orders = Math.max(0, shop.orders - 1);
    if (!was && now) {
      visit.first = shop.orders === 0;
      shop.orders += 1;
    }
    shop.stage = stageFor(shop, b.outcome);
    await store.hset("field:shops", shop.id, shop);
  }
  visit.outcome = b.outcome;
  visit.value = order.value;
  visit.terms = order.terms;
  visit.note = clean(b.note, 500);
  visit.editedBy = me.email;
  await store.hset(key, visit.id, visit);
  res.json({ visit });
}

async function remove(req, res) {
  const me = await guard(req, res, ["admin"]);
  if (!me) return;
  const id = req.query.id || readBody(req).id;
  const { key, visit } = await find(id);
  if (!visit) return res.status(404).json({ error: "That check-in was not found." });
  const shop = await store.hget("field:shops", visit.shopId);
  if (shop && visit.outcome === "order") {
    shop.orders = Math.max(0, shop.orders - 1);
    shop.stage = stageFor(shop, "");
    await store.hset("field:shops", shop.id, shop);
  }
  await store.hdel(key, visit.id);
  res.json({ ok: true });
}
