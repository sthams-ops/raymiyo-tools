// Check-ins.
//   POST    save a new check-in (field users and admin). GPS is required.
//   PATCH   correct a check-in (admin only)
//   DELETE  remove a check-in (admin only)
import { store } from "../lib/store.js";
import { guard, loadUsers, readBody, clean, fail, rid } from "../lib/auth.js";
import { loadSettings, stageFor } from "../lib/data.js";
import { nepal, addDays, isDate } from "../lib/time.js";
import { syncVisit, cancelVisit } from "../lib/crm.js";
import { OUTCOMES, NEXT_STEPS, distanceMeters, visitPoints, phoneKey, findDuplicate, orderTotals } from "../shared/rules.js";
import { loadProducts } from "../lib/products.js";

const TERMS = ["Cash", "Credit (Cheque)"];
const bad = (res, msg) => res.status(400).json({ error: msg });

// An order with products: prices come from the CRM list, never from the phone.
function readItems(b, res, products, maxMargin, shopMargin) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = [];
  for (const raw of Array.isArray(b.items) ? b.items.slice(0, 40) : []) {
    const p = byId.get(String(raw.id));
    const qty = Math.round(Number(raw.qty));
    if (!p || !(qty > 0) || qty > 9999) continue;
    const same = items.find((i) => i.id === p.id);
    if (same) same.qty += qty;
    else items.push({ id: p.id, name: p.name, price: p.price, qty });
  }
  if (!items.length) {
    bad(res, "Add at least one product to the order.");
    return null;
  }
  let margin = b.margin == null || b.margin === "" ? Number(shopMargin) || 0 : Number(b.margin);
  if (!Number.isFinite(margin) || margin < 0 || margin > maxMargin) {
    bad(res, `The shop's margin must be between 0 and ${maxMargin}%.`);
    return null;
  }
  margin = Math.round(margin * 100) / 100;
  const t = orderTotals(items, margin);
  return { value: t.total, terms: TERMS.includes(b.terms) ? b.terms : "Cash", items, margin, subtotal: t.subtotal, discount: t.discount };
}

function readOrder(b, res) {
  if (b.outcome !== "order") return { value: 0, terms: "" };
  const value = Math.round(Number(b.value));
  if (!(value > 0) || value > 100000000) {
    bad(res, "Enter the order amount in rupees.");
    return null;
  }
  return { value, terms: TERMS.includes(b.terms) ? b.terms : "Cash" };
}

// The next step for a check-in and the date it is due. A date picked by the
// field user wins when it is in the future (at most 60 days ahead).
function followUp(outcome, date, picked) {
  const rule = NEXT_STEPS[outcome] || NEXT_STEPS.no;
  if (!rule.days) return { nextStep: rule.step, followUp: "" };
  const ok = isDate(picked) && picked > date && picked <= addDays(date, 60);
  return { nextStep: rule.step, followUp: ok ? picked : addDays(date, rule.days) };
}

// What the shop is waiting for, shown in the field user's focus list.
function setNext(shop, visit) {
  shop.next = visit.nextStep && visit.nextStep !== "No action" && visit.followUp ? { step: visit.nextStep, due: visit.followUp, visitId: visit.id, amount: visit.value || 0 } : null;
  shop.lastOutcome = visit.outcome;
  shop.lastNote = (visit.note || "").slice(0, 140);
}

async function pushToCrm(key, visit, shop, user, settings, doneCrmId = "") {
  const sync = await syncVisit(visit, shop, user, visitPoints(visit, settings.points), doneCrmId);
  if (sync.status === "off") return;
  if (sync.soCrmId) visit.soId = sync.soCrmId;
  visit.crm = sync.status;
  visit.crmError = sync.detail ? clean(sync.detail, 200) : "";
  if (sync.visitCrmId) visit.crmId = sync.visitCrmId;
  if (sync.soCrmId) visit.soId = sync.soCrmId;
  visit.crmNote = sync.note ? clean(sync.note, 200) : "";
  await store.hset(key, visit.id, visit);
  if (sync.accountCrmId && shop && !shop.crmId) {
    shop.crmId = sync.accountCrmId;
    await store.hset("field:shops", shop.id, shop);
  }
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

  const settings = await loadSettings();
  const { date, time, month } = nepal();
  let shop;
  let newShop = false;
  const phone = phoneKey(b.phone);
  if (b.shopId) {
    shop = await store.hget("field:shops", String(b.shopId));
    if (!shop || shop.active === false) return res.status(404).json({ error: "That shop was not found. Refresh and try again." });
    if (!phoneKey(shop.phone)) {
      if (!phone) return bad(res, "Add the shop's phone number.");
      const twin = findDuplicate(Object.values(await store.hall("field:shops")), { phone, ignoreId: shop.id });
      if (twin) return res.status(409).json({ error: `That phone number is already saved for ${twin.shop.name}.` });
      shop.phone = phone;
    }
  } else {
    const name = clean(b.shopName, 80);
    if (!name) return bad(res, "Type the shop name.");
    if (!phone) return bad(res, "Add the shop's phone number. It needs at least 7 digits.");
    const twin = findDuplicate(Object.values(await store.hall("field:shops")), { name, phone, lat, lng });
    if (twin) {
      const where = twin.shop.area ? ` in ${twin.shop.area}` : "";
      const fix = twin.shop.active === false ? "It is archived. Ask the admin to restore it." : "Pick it from the shop list instead.";
      return res.status(409).json({ error: twin.why === "phone" ? `That phone number is already saved for ${twin.shop.name}${where}. ${fix}` : `${twin.shop.name}${where} is already saved close to here. ${fix}`, duplicate: twin.shop.id });
    }
    shop = {
      id: "s_" + rid(6),
      name,
      type: b.shopType === "Wholesaler" ? "Wholesaler" : "Retailer",
      area: clean(b.area, 40),
      phone,
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

  // With the CRM product list on hand an order is taken product by product.
  const products = b.outcome === "order" ? (await loadProducts()).list : [];
  const order = products.length ? readItems(b, res, products, settings.maxMargin, shop.margin) : readOrder(b, res);
  if (!order) return;
  if (order.items) shop.margin = order.margin;

  const distance = newShop ? 0 : distanceMeters([lat, lng], [shop.lat, shop.lng]);
  const brands = Array.isArray(b.brands) ? b.brands.map((x) => clean(x, 30)).filter((x) => settings.brands.includes(x)) : [];
  const photo = typeof b.photo === "string" && /^(https:\/\/[^\s]+|\/photos\/[\w\-\/]+\.jpg)$/.test(b.photo) ? b.photo.slice(0, 400) : "";
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
    ...(order.items ? { items: order.items, margin: order.margin, subtotal: order.subtotal, discount: order.discount } : {}),
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
    ...followUp(b.outcome, date, b.followUp),
  };
  if (visit.outcome === "order") {
    visit.first = shop.orders === 0;
    shop.orders += 1;
    shop.terms = order.terms;
  }
  shop.lastVisit = date;
  shop.stage = stageFor(shop, visit.outcome);
  // This visit closes whatever the shop was waiting for.
  let doneCrmId = "";
  if (shop.next && shop.next.visitId) {
    const before = await find(shop.next.visitId);
    doneCrmId = (before.visit && before.visit.crmId) || "";
  }
  setNext(shop, visit);

  await store.hset("field:shops", shop.id, shop);
  await store.hset("field:visits:" + month, visit.id, visit);

  const day = (await store.hget("field:day:" + date, me.email)) || { start: time };
  await store.hset("field:day:" + date, me.email, { ...day, end: "", lat, lng, at: time });

  await pushToCrm("field:visits:" + month, visit, shop, me, settings, doneCrmId);
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
  if (visit.soId && b.outcome !== "order") return bad(res, "This order is already a Sales Order in CRM. Cancel it in CRM first, then delete the check-in here.");
  // An order taken product by product keeps its products and amount.
  const itemised = visit.items && visit.items.length && b.outcome === "order";
  const order = itemised ? { value: visit.value, terms: TERMS.includes(b.terms) ? b.terms : visit.terms } : readOrder(b, res);
  if (!order) return;
  if (!itemised) for (const k of ["items", "margin", "subtotal", "discount"]) delete visit[k];

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
  }
  visit.outcome = b.outcome;
  visit.value = order.value;
  visit.terms = order.terms;
  visit.note = clean(b.note, 500);
  visit.editedBy = me.email;
  Object.assign(visit, followUp(visit.outcome, visit.date, visit.followUp));
  if (shop) {
    // Only the shop's latest check-in decides what it is waiting for.
    if (!shop.next || shop.next.visitId === visit.id || shop.lastVisit === visit.date) setNext(shop, visit);
    await store.hset("field:shops", shop.id, shop);
  }
  await store.hset(key, visit.id, visit);
  // Keep Zoho CRM in step with the correction.
  const users = await loadUsers();
  await pushToCrm(key, visit, shop || { id: visit.shopId, name: visit.shopName, area: visit.area }, users[visit.rep] || { email: visit.rep, name: visit.rep }, await loadSettings());
  res.json({ visit });
}

async function remove(req, res) {
  const me = await guard(req, res, ["admin"]);
  if (!me) return;
  const id = req.query.id || readBody(req).id;
  const { key, visit } = await find(id);
  if (!visit) return res.status(404).json({ error: "That check-in was not found." });
  const shop = await store.hget("field:shops", visit.shopId);
  if (shop) {
    if (visit.outcome === "order") {
      shop.orders = Math.max(0, shop.orders - 1);
      shop.stage = stageFor(shop, "");
    }
    if (shop.next && shop.next.visitId === visit.id) shop.next = null;
    if (shop.dues) shop.dues = shop.dues.filter((d) => d.visitId !== visit.id);
    await store.hset("field:shops", shop.id, shop);
  }
  await store.hdel(key, visit.id);
  await cancelVisit(visit, shop);
  res.json({ ok: true });
}
