// Shops. New shops are created by a check-in (api/visits.js).
//   PATCH  admin corrects a shop: name, type, area, phone, who it belongs to,
//          payment terms, or archives it (active: false).
import { store } from "../lib/store.js";
import { guard, readBody, clean, fail, loadUsers } from "../lib/auth.js";
import { doneVisit, syncVisit, sendPayment } from "../lib/crm.js";
import { loadSettings } from "../lib/data.js";
import { nepal, when, addDays, isDate } from "../lib/time.js";
import { replay } from "../lib/idem.js";
import { phoneKey, findDuplicate, visitPoints } from "../shared/rules.js";

const PHOTO = /^(https:\/\/[^\s]+|\/photos\/[\w\-\/]+\.jpg)$/;
const visitKey = (id) => "field:visits:" + String(id).slice(0, 7);

// Reads the payment part of a delivery or collection. Answers null after
// sending the error itself.
function readPay(b, res, today, fallbackAmount) {
  const bad = (msg) => (res.status(400).json({ error: msg }), null);
  const p = b.pay || {};
  if (!["cash", "cheque", "later"].includes(p.type)) return bad("Pick how the shop is paying.");
  const amount = Math.round(Number(p.amount || fallbackAmount) * 100) / 100;
  if (!(amount > 0) || amount > 100000000) return bad("Enter the amount in rupees.");
  if (p.type === "cash") return { type: "cash", amount, date: today };
  if (!isDate(p.date)) return bad(p.type === "cheque" ? "Enter the date written on the cheque." : "Pick the date the shop will pay.");
  if (p.type === "cheque") {
    if (p.date < addDays(today, -30) || p.date > addDays(today, 200)) return bad("Check the cheque date. It looks too far away.");
    if (typeof p.photo !== "string" || !PHOTO.test(p.photo)) return bad("Take a photo of the cheque.");
    return { type: "cheque", amount, date: p.date, photo: p.photo.slice(0, 400) };
  }
  if (p.date < today || p.date > addDays(today, 90)) return bad("Pick a payment date within the next 90 days.");
  return { type: "later", amount, date: p.date };
}

async function pushVisit(visit, shop) {
  const [users, settings] = await Promise.all([loadUsers(), loadSettings()]);
  const sync = await syncVisit(visit, shop, users[visit.rep] || { email: visit.rep, name: visit.rep }, visitPoints(visit, settings.points));
  if (sync.status === "off") return;
  visit.crm = sync.status;
  visit.crmError = sync.detail ? clean(sync.detail, 200) : "";
  if (sync.visitCrmId) visit.crmId = sync.visitCrmId;
  if (sync.soCrmId) visit.soId = sync.soCrmId;
  const pay = await sendPayment(visit);
  if (pay.status !== "off") {
    visit.payCrm = pay.status;
    visit.payCrmError = pay.detail ? clean(pay.detail, 200) : "";
  }
}

// POST { id, action }: things the shop's owner (or an admin) does from the focus list.
//   done      tick off a follow-up or revisit
//   deliver   the order was delivered: how is the shop paying? { pay }
//   collect   money promised for later has come in { visitId, pay }
//   cleared   a cheque has cleared { visitId }
async function act(req, res) {
  const me = await guard(req, res, ["rep", "admin"]);
  if (!me) return;
  const b = readBody(req);
  if (await replay(req, res, b, me.email)) return;
  const shop = await store.hget("field:shops", String(b.id || ""));
  if (!shop) return res.status(404).json({ error: "That shop was not found." });
  // Anyone standing at an archived shop can bring it back, so it is never saved twice.
  if (b.action === "restore") {
    shop.active = true;
    await store.hset("field:shops", shop.id, shop);
    return res.json({ shop });
  }
  if (me.role === "rep" && shop.owner !== me.email) return res.status(403).json({ error: "This shop belongs to someone else." });
  const { date: today, time } = nepal(when(b.at));
  shop.dues = shop.dues || [];

  if (b.action === "deliver" || b.action === "collect") {
    const id = String(b.action === "deliver" ? (shop.next && shop.next.step === "Deliver order" && shop.next.visitId) || "" : b.visitId || "");
    const visit = id ? await store.hget(visitKey(id), id) : null;
    if (!visit || visit.shopId !== shop.id) return res.status(404).json({ error: "That order was not found. Refresh and try again." });
    const old = shop.dues.find((d) => d.visitId === id);
    if (b.action === "collect" && !old) return res.status(400).json({ error: "Nothing is waiting to be collected for that order." });
    const pay = readPay(b, res, today, old ? old.amount : visit.value);
    if (!pay) return;
    if (b.action === "collect" && pay.type === "later") return res.status(400).json({ error: "Pick cash or cheque." });
    visit.pay = { ...pay, at: today, time, by: me.email };
    if (b.action === "deliver") {
      visit.deliveredOn = today;
      visit.done = true;
      shop.next = null;
    }
    shop.dues = shop.dues.filter((d) => d.visitId !== id);
    if (pay.type !== "cash") shop.dues.push({ visitId: id, type: pay.type, amount: pay.amount, date: pay.date });
    await store.hset("field:shops", shop.id, shop);
    await store.hset(visitKey(id), id, visit);
    await pushVisit(visit, shop);
    await store.hset(visitKey(id), id, visit);
    return res.json({ shop, visit });
  }

  if (b.action === "cleared") {
    shop.dues = shop.dues.filter((d) => !(d.visitId === String(b.visitId || "") && d.type === "cheque"));
    await store.hset("field:shops", shop.id, shop);
    return res.json({ shop });
  }

  if (shop.next && shop.next.step === "Deliver order") return res.status(400).json({ error: "Use Delivered so the payment is recorded." });
  if (shop.next && shop.next.visitId) {
    const id = String(shop.next.visitId);
    const visit = await store.hget(visitKey(id), id);
    if (visit) {
      visit.done = true;
      await store.hset(visitKey(id), id, visit);
      await doneVisit(visit);
    }
  }
  shop.next = null;
  await store.hset("field:shops", shop.id, shop);
  res.json({ shop });
}

export default async function handler(req, res) {
  try {
    if (req.method === "POST") return await act(req, res);
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
    if (b.margin != null && b.margin !== "") {
      const m = Math.round(Number(b.margin) * 100) / 100;
      const max = (await loadSettings()).maxMargin;
      if (!Number.isFinite(m) || m < 0 || m > max) return res.status(400).json({ error: `The margin must be between 0 and ${max}%.` });
      shop.margin = m;
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
