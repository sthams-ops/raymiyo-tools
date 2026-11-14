// Sends each saved check-in to Zoho CRM.
// It stays switched off until ZOHO_FIELD_API_KEY is set in Vercel. The value is
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

export async function syncVisit(visit, shop, user) {
  const t = target();
  if (!t) return { status: "off" };
  const payload = JSON.stringify({
    visit_id: visit.id,
    date: visit.date,
    time: visit.time,
    rep_email: user.email,
    rep_name: user.name,
    shop_id: shop.id,
    shop_name: shop.name,
    shop_type: shop.type,
    shop_area: shop.area,
    shop_phone: shop.phone,
    shop_stage: shop.stage,
    crm_account_id: shop.crmId || "",
    new_shop: visit.newShop,
    outcome: visit.outcome,
    order_value: visit.value || 0,
    payment_terms: visit.terms || "",
    brands: (visit.brands || []).join(", "),
    note: visit.note || "",
    photo_url: visit.photo || "",
    latitude: visit.lat,
    longitude: visit.lng,
  });
  const q = new URLSearchParams({ auth_type: "apikey", zapikey: t.key, payload });
  try {
    const resp = await fetch(`${t.url}?${q}`, { method: "POST", signal: AbortSignal.timeout(7000) });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.code !== "success") return { status: "error", detail: data.message || `Zoho answered ${resp.status}` };
    // The function may answer with the CRM ids as JSON text in details.output.
    let out = {};
    try {
      out = JSON.parse(data.details && data.details.output ? data.details.output : "{}");
    } catch {}
    return { status: "ok", visitCrmId: out.visit_id || "", accountCrmId: out.account_id || "" };
  } catch (e) {
    return { status: "error", detail: e.name === "TimeoutError" ? "Zoho took too long to answer" : e.message };
  }
}
