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
    if (out.error) return { status: "error", detail: String(out.error) };
    return { status: "ok", visitCrmId: out.visit_id || "", accountCrmId: out.account_id || "" };
  } catch (e) {
    return { status: "error", detail: e.name === "TimeoutError" ? "Zoho took too long to answer" : e.message };
  }
}

// Creates the Shop Visit in CRM, or updates it when the same check-in is sent again.
export function syncVisit(visit, shop, user, points = 0) {
  const photo = visit.photo && visit.photo.startsWith("/") ? appUrl() + visit.photo : visit.photo || "";
  return send({
    action: "save",
    visit_id: visit.id,
    crm_visit_id: visit.crmId || "",
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
    note: visit.note || "",
    points,
    away_from_shop: !!visit.far,
    distance_m: visit.distance || 0,
    photo_url: photo,
    map_url: `https://www.google.com/maps?q=${visit.lat},${visit.lng}`,
    latitude: visit.lat,
    longitude: visit.lng,
  });
}

// Marks the Shop Visit as cancelled in CRM when an admin deletes the check-in.
export function cancelVisit(visit, shop) {
  return send({ action: "cancel", visit_id: visit.id, crm_visit_id: visit.crmId || "", crm_account_id: (shop && shop.crmId) || "", shop_stage: (shop && shop.stage) || "" });
}
