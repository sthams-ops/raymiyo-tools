// Sends each saved check-in to Zoho CRM.
// It stays switched off until ZOHO_FIELD_API_KEY is set on the host. The value is
// the REST API URL of the CRM function that creates the Shop Visit record, the
// same way ZOHO_TV_API_KEY works for the TV board. The function receives one
// argument, "payload", holding the check-in as JSON text.

function target() {
  const raw = (process.env.ZOHO_FIELD_API_KEY || "").trim();
  if (!raw || !raw.includes("zapikey=")) return null;
  try {
    const u = new URL(raw);
    const key = u.searchParams.get("zapikey");
    if (!key || !/\/functions\/[^/]+\/actions\/execute/.test(u.pathname)) return null;
    return { url: u.origin + u.pathname, key };
  } catch {
    return null;
  }
}

const round6 = (n) => (Number.isFinite(Number(n)) && n !== null && n !== "" ? Math.round(Number(n) * 1e6) / 1e6 : null);
export const crmEnabled = () => !!target();

const appUrl = () => (process.env.FIELD_APP_URL || "").replace(/\/$/, "");

async function send(body) {
  const t = target();
  if (!t) return { status: "off" };
  const q = new URLSearchParams({ auth_type: "apikey", zapikey: t.key, payload: JSON.stringify(body) });
  try {
    const resp = await fetch(`${t.url}?${q}`, { method: "POST", signal: AbortSignal.timeout(9000) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.code !== "success") return { status: "error", detail: data.message || `Zoho answered ${resp.status}` };
    // The function answers with JSON text in details.output: the CRM ids, or an error.
    let out = {};
    try {
      out = JSON.parse(data.details && data.details.output ? data.details.output : "{}");
    } catch {}
    if (out.error) return { status: "error", detail: String(out.error), soCrmId: out.so_id || "", accountCrmId: out.account_id || "", out };
    return { status: "ok", visitCrmId: out.visit_id || "", accountCrmId: out.account_id || "", soCrmId: out.so_id || "", note: out.note ? String(out.note) : "", out };
  } catch (e) {
    return { status: "error", detail: e.name === "TimeoutError" ? "Zoho took too long to answer" : e.message };
  }
}

const abs = (url) => (url && url.startsWith("/") ? appUrl() + url : url || "");

// Delivery and payment details kept on the order's check-in.
function payFields(visit) {
  const p = visit.pay || {};
  return {
    delivered_on: visit.deliveredOn || "",
    pay_type: p.type === "cash" ? "Cash" : p.type === "cheque" ? "Cheque" : p.type === "later" ? "Pay later" : "",
    pay_amount: p.type === "cash" || p.type === "cheque" ? p.amount || 0 : 0,
    cheque_date: p.type === "cheque" ? p.date || "" : "",
    cheque_photo: p.type === "cheque" ? abs(p.photo) : "",
    pay_due: p.type === "later" ? p.date || "" : "",
  };
}

// Creates the Shop Visit in CRM, or updates it when the same check-in is sent again.
export function syncVisit(visit, shop, user, points = 0, doneCrmId = "") {
  const photo = visit.photo && visit.photo.startsWith("/") ? appUrl() + visit.photo : visit.photo || "";
  return send({
    action: "save",
    visit_id: visit.id,
    crm_visit_id: visit.crmId || "",
    done_crm_visit_id: doneCrmId || "",
    date: visit.date,
    time: visit.time,
    rep_email: user.email,
    rep_name: user.name,
    shop_id: shop.id,
    shop_name: shop.name,
    shop_type: shop.type || "Retailer",
    shop_area: shop.area || "",
    shop_phone: shop.phone || "",
    shop_stage: shop.stage || "",
    crm_account_id: shop.crmId || "",
    new_shop: !!visit.newShop,
    first_order: !!visit.first,
    outcome: visit.outcome,
    order_value: visit.value || 0,
    payment_terms: visit.terms || "",
    next_step: visit.nextStep || "",
    follow_up_date: visit.followUp || "",
    brands: (visit.brands || []).join(", "),
    items: (visit.items || []).map((i) => ({ id: i.id, qty: i.qty, price: i.price })),
    items_text: (visit.items || []).map((i) => `${i.qty} x ${i.name}`).join("\n"),
    margin: visit.margin || 0,
    discount: visit.discount || 0,
    crm_so_id: visit.soId || "",
    ...payFields(visit),
    contact_person: visit.contact || "",
    contact_role: visit.contactRole || "",
    note: [visit.contact ? `Talked to: ${visit.contact}${visit.contactRole ? " (" + visit.contactRole + ")" : ""}` : "", visit.note || ""].filter(Boolean).join("\n"),
    points,
    away_from_shop: !!visit.far,
    distance_m: visit.distance || 0,
    photo_url: photo,
    map_url: `https://www.google.com/maps?q=${visit.lat},${visit.lng}`,
    latitude: round6(visit.lat),
    longitude: round6(visit.lng),
  });
}

// Marks the Shop Visit as cancelled in CRM when an admin deletes the check-in.
export function cancelVisit(visit, shop) {
  return send({ action: "cancel", visit_id: visit.id, crm_visit_id: visit.crmId || "", crm_account_id: (shop && shop.crmId) || "", shop_stage: (shop && shop.stage) || "" });
}

// Ticks "Follow up Done" on a Shop Visit when the task is marked done in the app.
export function doneVisit(visit) {
  if (!visit || !visit.crmId) return Promise.resolve({ status: "off" });
  return send({ action: "done", visit_id: visit.id, crm_visit_id: visit.crmId });
}

// The sellable products, straight from the CRM Products module.
export async function fetchProducts() {
  const r = await send({ action: "products" });
  if (r.status !== "ok") return r;
  return { status: "ok", products: Array.isArray(r.out.products) ? r.out.products : [] };
}

// Puts a cash payment or a cheque on the order's Invoice in CRM. Answers
// status "waiting" while the Sales Order has not been marked Delivered yet.
export async function sendPayment(visit) {
  if (!visit.soId || !visit.pay || visit.pay.type === "later") return { status: "off" };
  const r = await send({ action: "collect", visit_id: visit.id, crm_so_id: visit.soId, shop_name: visit.shopName, ...payFields(visit), pay_on: visit.pay.at || visit.date });
  if (r.status === "ok" && r.out.waiting) return { status: "waiting", detail: "The Sales Order is not marked Delivered in CRM yet." };
  return r;
}

// What is still unpaid on each order's Invoice: { soId: balance }.
export async function fetchBalances(soIds) {
  const r = await send({ action: "balances", so_ids: soIds.join(",") });
  return r.status === "ok" ? r.out.balances || {} : null;
}

// The CRM status of each Sales Order: { soId: "Created" | "Approved" | "Delivered" | "Cancelled" | "Deleted" }.
// null when CRM could not be asked (the function is an older copy, or Zoho is down).
export async function fetchOrderStatuses(soIds) {
  if (!soIds.length) return {};
  const r = await send({ action: "statuses", so_ids: soIds.join(",") });
  return r.status === "ok" && r.out.statuses && typeof r.out.statuses === "object" ? r.out.statuses : null;
}
