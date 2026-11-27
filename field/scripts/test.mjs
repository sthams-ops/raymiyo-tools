// Checks the server rules: who can do what, points, shops and the TV link.
//   npm test
// Uses in-memory storage, so it never touches real data.
import assert from "node:assert/strict";
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.VERCEL;
delete process.env.REDIS_URL;
delete process.env.RAILWAY_ENVIRONMENT;
delete process.env.RAILWAY_PROJECT_ID;
delete process.env.FIELD_HTTPS;

const { store } = await import("../lib/store.js");
const { monthsBetween, weekStart, nepal } = await import("../lib/time.js");
const api = {};
for (const name of ["state", "visits", "shops", "day", "admin", "tv", "photo", "track", "chat"]) api[name] = (await import(`../api/${name}.js`)).default;

const SID = { mijesh: "a".repeat(64), bivek: "b".repeat(64), divash: "c".repeat(64), sajina: "d".repeat(64) };
const EMAIL = { mijesh: "mijesh.shrestha@unijoynepal.com", bivek: "bivek.maharjan@unijoynepal.com", divash: "divash.shilpakar@unijoynepal.com", sajina: "sajina@unijoynepal.com" };
for (const k of Object.keys(SID)) await store.set("field:session:" + SID[k], { email: EMAIL[k] });

async function call(name, { as, method = "GET", query = {}, body, bearer } = {}) {
  const req = { method, query, body, headers: { cookie: as ? `field_session=${SID[as]}` : "", ...(bearer ? { authorization: "Bearer " + bearer } : {}) } };
  const out = { code: 200, data: null };
  const res = {
    status: (c) => ((out.code = c), res),
    json: (d) => ((out.data = d), res),
    setHeader: () => {},
  };
  await api[name](req, res);
  return out;
}
let passed = 0;
const ok = (cond, label) => {
  assert.ok(cond, label);
  passed += 1;
};
const KALIMATI = { lat: 27.6985, lng: 85.3003, accuracy: 12 };

// dates
ok(monthsBetween("2026-10-28", "2027-01-03").join() === "2026-10,2026-11,2026-12,2027-01", "months across a year end");
ok(weekStart("2026-11-18") === "2026-11-15", "week starts on Sunday");
ok(/^\d{4}-\d{2}-\d{2}$/.test(nepal().date), "nepal date format");

// signed out
ok((await call("state")).code === 401, "signed-out person gets nothing");

// field user checks in
let r = await call("visits", { as: "divash", method: "POST", body: { shopName: "Test Kirana", outcome: "order", value: 8400 } });
ok(r.code === 400, "check-in without GPS is refused");
r = await call("visits", { as: "divash", method: "POST", body: { shopName: "Test Kirana", shopType: "Retailer", area: "Kalimati", outcome: "order", value: 0, ...KALIMATI } });
ok(r.code === 400, "order needs an amount");
r = await call("visits", { as: "divash", method: "POST", body: { shopName: "Test Kirana", shopType: "Retailer", area: "Kalimati", outcome: "order", value: 8400, terms: "Cash", brands: ["Chicool", "Made up"], note: "  two   cartons ", contact: "  Ram  Shrestha ", contactRole: "Boss", phone: "+977 9811111111", ...KALIMATI } });
const noPhone = await call("visits", { as: "divash", method: "POST", body: { shopName: "No Phone Shop", outcome: "no", ...KALIMATI } });
ok(r.code === 200 && r.data.visit.newShop && r.data.visit.first, "new shop with a first order saves");
ok(r.data.visit.brands.join() === "Chicool" && r.data.visit.note === "two cartons", "brands and note are cleaned");
ok(r.data.visit.contact === "Ram Shrestha" && r.data.visit.contactRole === "Owner", "person talked to is saved, unknown role falls back to Owner");
ok(r.data.shop.contact && r.data.shop.contact.name === "Ram Shrestha", "shop remembers who to ask for next time");
ok(r.data.shop.stage === "First Order" && r.data.shop.orders === 1 && r.data.shop.owner === EMAIL.divash, "shop stage and owner set");
ok(noPhone.code === 400, "new shop without a phone number is refused");
ok(r.data.shop.phone === "9811111111", "phone is saved as digits without the country code");
ok(r.data.shop.next && r.data.shop.next.step === "Deliver order", "an order leaves a delivery to do");
const shopId = r.data.shop.id;
{
  // duplicates
  let d = await call("visits", { as: "sajina", method: "POST", body: { shopName: "Another Name", phone: "9811111111", outcome: "no", lat: 27.75, lng: 85.35 } });
  ok(d.code === 409 && d.data.duplicate === shopId, "same phone number is caught as a duplicate");
  d = await call("visits", { as: "sajina", method: "POST", body: { shopName: "test  KIRANA store", phone: "9822222222", outcome: "no", ...KALIMATI } });
  ok(d.code === 409, "same name close by is caught as a duplicate");
  const rules = await import("../shared/rules.js");
  const list = rules.focusList([r.data.shop], rules.daysBetween("2026-01-01", "2026-01-01") === 0 ? r.data.shop.next.due : "", { owner: EMAIL.divash });
  ok(list.length === 1 && list[0].kind === "deliver" && list[0].level === "today", "delivery shows on the focus list on its day");
  const late = rules.focusList([{ ...r.data.shop, next: { step: "Follow up", due: "2026-11-10", visitId: "x" } }], "2026-11-13");
  ok(late[0].level === "overdue" && late[0].late === 3, "late follow-up is overdue");
  const quiet = rules.focusList([{ ...r.data.shop, next: null, lastVisit: "2026-10-01" }], "2026-11-13");
  ok(quiet[0].kind === "reorder" && quiet[0].level === "push", "buying shop gone quiet asks for a reorder");
  ok(rules.workingDays("2026-11-15", "2026-11-21") === 6, "Saturday is not a working day");
  const c = rules.coach([{ email: "a", name: "A", visits: 4, orders: 0, value: 0, newShops: 0, points: 4, far: 3, days: 1 }], [], { from: "2026-11-15", today: "2026-11-18", dailyVisits: 12, todayRows: [], nowTime: "14:00" });
  ok(c[0].status === "push" && c[0].flags.length >= 3, "coach flags a low performer");
  const fresh = rules.coach([{ email: "a", name: "A", visits: 4, orders: 1, value: 1, newShops: 0, points: 4, far: 0, days: 1 }], [], { from: "2026-11-15", today: "2026-11-15", dailyVisits: 12, todayRows: [{ email: "a", visits: 4 }], nowTime: "12:00" });
  ok(fresh[0].flags.length === 0, "a day still in progress is not judged on pace");
}
const visit1 = r.data.visit.id;

{
  const no = await call("shops", { as: "sajina", method: "POST", body: { id: shopId, action: "done" } });
  ok(no.code === 403, "only the shop's owner can tick its task off");
  let yes = await call("shops", { as: "divash", method: "POST", body: { id: shopId, action: "done" } });
  ok(yes.code === 400, "a delivery cannot be ticked off without the payment");
  yes = await call("shops", { as: "divash", method: "POST", body: { id: shopId, action: "deliver", pay: { type: "cheque", date: "2026-12-20" } } });
  ok(yes.code === 400, "a cheque needs its photo");
  const chequeDate = (await import("../lib/time.js")).addDays(nepal().date, 30);
  yes = await call("shops", { as: "divash", method: "POST", body: { id: shopId, action: "deliver", pay: { type: "cheque", date: chequeDate, photo: "/photos/2026-11-15/abc.jpg" } } });
  ok(yes.code === 200 && yes.data.shop.next === null && yes.data.shop.dues.length === 1 && yes.data.shop.dues[0].amount === 8400, "delivery with a cheque leaves the amount as due");
  ok(yes.data.visit.deliveredOn === nepal().date && yes.data.visit.pay.type === "cheque", "delivery and cheque are kept on the order");
  const rules = await import("../shared/rules.js");
  ok(rules.shopOwes(yes.data.shop) === 8400, "shop owes the cheque amount");
  const soon = rules.focusList([yes.data.shop], (await import("../lib/time.js")).addDays(chequeDate, -3));
  ok(soon.some((f) => f.kind === "cheque" && f.level === "soon"), "cheque shows on the focus list before its date");
  yes = await call("shops", { as: "divash", method: "POST", body: { id: shopId, action: "cleared", visitId: visit1 } });
  ok(yes.code === 200 && yes.data.shop.dues.length === 0, "cleared cheque drops off");
}
{
  // orders product by product, priced from the CRM list
  await store.set("field:products", { at: Date.now(), list: [{ id: "111", name: "Pant XL Jumbo", code: "X", category: "Diaper", unit: "Carton", price: 1450 }, { id: "222", name: "Pant L Mini", code: "Y", category: "Diaper", unit: "Carton", price: 1000 }] });
  const st = await call("state", { as: "sajina" });
  ok(st.data.products.length === 2, "products reach the screen");
  const base = { shopName: "Items Shop", phone: "9833333333", outcome: "order", lat: 27.71, lng: 85.31 };
  let o = await call("visits", { as: "sajina", method: "POST", body: { ...base, value: 5000 } });
  ok(o.code === 400, "an order needs products once the list is there");
  o = await call("visits", { as: "sajina", method: "POST", body: { ...base, items: [{ id: "111", qty: 4 }], margin: 80 } });
  ok(o.code === 400, "margin above the limit is refused");
  o = await call("visits", { as: "sajina", method: "POST", body: { ...base, items: [{ id: "111", qty: 4, price: 1 }, { id: "222", qty: 3 }, { id: "999", qty: 2 }], margin: 25 } });
  ok(o.code === 200 && o.data.visit.subtotal === 8800 && o.data.visit.discount === 2200 && o.data.visit.value === 6600, "order total uses CRM prices and the shop margin");
  ok(o.data.shop.margin === 25 && o.data.visit.items.length === 2, "margin is remembered for the shop, unknown products dropped");
  const sid = o.data.shop.id;
  const day = (n) => new Date(Date.now() + 345 * 60000 + n * 86400000).toISOString().slice(0, 10);
  o = await call("shops", { as: "sajina", method: "POST", body: { id: sid, action: "deliver", pay: { type: "later", date: day(5) } } });
  ok(o.code === 200 && o.data.shop.dues[0].type === "later" && o.data.shop.dues[0].amount === 6600, "pay later leaves a collection to do");
  o = await call("shops", { as: "sajina", method: "POST", body: { id: sid, action: "collect", visitId: o.data.visit.id, pay: { type: "cash" } } });
  ok(o.code === 200 && o.data.shop.dues.length === 0 && o.data.visit.pay.type === "cash", "cash collected clears the due");
  for (const [id, v] of Object.entries(await store.hall("field:visits:" + nepal().month))) if (v.shopId === sid) await store.hdel("field:visits:" + nepal().month, id);
  await store.hdel("field:shops", sid);
  await store.set("field:products", { at: 0, list: [] });
}
{
}
r = await call("visits", { as: "sajina", method: "POST", body: { shopId, outcome: "order", value: 5000, terms: "Credit (Cheque)", lat: 27.7218, lng: 85.3202 } });
ok(r.code === 200 && !r.data.visit.first && !r.data.visit.newShop, "second order is a repeat order");
ok(r.data.visit.far && r.data.visit.distance > 2000, "check-in far from the shop is flagged");
ok(r.data.shop.stage === "Repeat Buyer", "shop becomes a repeat buyer");
const visit2 = r.data.visit.id;

r = await call("day", { as: "sajina", method: "POST", body: { action: "start", lat: 27.72, lng: 85.32 } });
ok(r.code === 200 && r.data.day.start, "start of day saves");

// what each role sees
r = await call("state", { as: "divash" });
ok(r.data.visits.length === 1 && r.data.visits[0].rep === EMAIL.divash, "field user sees only own check-ins");
ok(!r.data.days[EMAIL.sajina], "field user does not see another person's location");
const d = r.data.board.today.find((x) => x.email === EMAIL.divash);
const s = r.data.board.today.find((x) => x.email === EMAIL.sajina);
ok(d.points === 12 && s.points === 6, "points: 1+1+10 for new shop first order, 1+5 for repeat");
r = await call("state", { as: "bivek" });
ok(r.code === 200 && r.data.visits.length === 2 && r.data.days[EMAIL.sajina], "view-only admin sees everything");

// view-only admin and field users cannot change things
ok((await call("visits", { as: "bivek", method: "POST", body: { shopId, outcome: "no", ...KALIMATI } })).code === 403, "view-only cannot check in");
ok((await call("visits", { as: "bivek", method: "DELETE", query: { id: visit1 } })).code === 403, "view-only cannot delete");
ok((await call("visits", { as: "bivek", method: "PATCH", body: { id: visit1, outcome: "no" } })).code === 403, "view-only cannot edit");
ok((await call("shops", { as: "bivek", method: "PATCH", body: { id: shopId, name: "X" } })).code === 403, "view-only cannot edit shops");
ok((await call("admin", { as: "bivek", method: "POST", body: { op: "saveSettings", settings: {} } })).code === 403, "view-only cannot change settings");
ok((await call("admin", { as: "divash", method: "POST", body: { op: "removeUser", email: EMAIL.sajina } })).code === 403, "field user cannot manage the team");
ok((await call("visits", { as: "divash", method: "DELETE", query: { id: visit2 } })).code === 403, "field user cannot delete check-ins");

// admin: team
r = await call("admin", { as: "mijesh", method: "POST", body: { op: "saveUser", user: { email: "someone@gmail.com", name: "Out Sider", role: "rep" } } });
ok(r.code === 400, "emails outside the company domain are refused");
r = await call("admin", { as: "mijesh", method: "POST", body: { op: "saveUser", user: { email: "New.Person@unijoynepal.com", name: "New Person", role: "rep" } } });
ok(r.code === 200 && r.data.user.email === "new.person@unijoynepal.com", "company email is added");
ok((await call("admin", { as: "mijesh", method: "POST", body: { op: "saveUser", user: { email: EMAIL.mijesh, name: "Mijesh", role: "rep" } } })).code === 400, "owner cannot be downgraded");
ok((await call("admin", { as: "mijesh", method: "POST", body: { op: "removeUser", email: EMAIL.mijesh } })).code === 400, "owner cannot be removed");

// admin: points rules re-score the board
r = await call("admin", { as: "mijesh", method: "POST", body: { op: "saveSettings", settings: { points: { visit: 2, newShop: 0, firstOrder: 20, repeatOrder: 3 }, farMeters: 100, brands: ["A", "B"] } } });
ok(r.code === 200 && r.data.settings.points.firstOrder === 20, "settings save");
r = await call("state", { as: "mijesh" });
ok(r.data.board.today.find((x) => x.email === EMAIL.divash).points === 22, "leaderboard uses the new rules");
ok(r.data.users.length === 5, "admin sees the whole team");

// admin: shops and check-ins
r = await call("shops", { as: "mijesh", method: "PATCH", body: { id: shopId, owner: EMAIL.sajina, name: "Renamed Kirana" } });
ok(r.code === 200 && r.data.shop.owner === EMAIL.sajina && r.data.shop.name === "Renamed Kirana", "admin reassigns and renames a shop");
ok((await call("shops", { as: "mijesh", method: "PATCH", body: { id: shopId, owner: "nobody@unijoynepal.com" } })).code === 400, "shop owner must be on the team");
r = await call("visits", { as: "mijesh", method: "PATCH", body: { id: visit2, outcome: "interested", note: "changed" } });
ok(r.code === 200 && r.data.visit.outcome === "interested" && r.data.visit.value === 0, "admin corrects a check-in");
ok((await store.hget("field:shops", shopId)).orders === 1, "shop order count follows the correction");
ok((await call("visits", { as: "mijesh", method: "DELETE", query: { id: visit1 } })).code === 200, "admin deletes a check-in");
ok((await store.hget("field:shops", shopId)).orders === 0, "shop order count follows the delete");
ok((await call("visits", { as: "mijesh", method: "DELETE", query: { id: "../../etc" } })).code === 404, "bad ids are refused");

// switched-off people lose access at once
await call("admin", { as: "mijesh", method: "POST", body: { op: "saveUser", user: { email: EMAIL.divash, name: "Divash Shilpakar", role: "rep", active: false } } });
ok((await call("state", { as: "divash" })).code === 401, "switched-off person is signed out");

// next steps and follow-up dates
{
  const { addDays } = await import("../lib/time.js");
  const today = nepal().date;
  const mk = (extra) => call("visits", { as: "sajina", method: "POST", body: { shopName: "Follow Test " + Math.random(), phone: "98" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0"), lat: 27.7, lng: 85.3, ...extra } });
  let f = await mk({ outcome: "interested" });
  ok(f.data.visit.nextStep === "Follow up" && f.data.visit.followUp === addDays(today, 3), "interested shop gets a follow-up in 3 days");
  f = await mk({ outcome: "absent", followUp: addDays(today, 5) });
  ok(f.data.visit.nextStep === "Revisit" && f.data.visit.followUp === addDays(today, 5), "the field user's own date wins");
  f = await mk({ outcome: "interested", followUp: "2020-01-01" });
  ok(f.data.visit.followUp === addDays(today, 3), "a past follow-up date is ignored");
  f = await mk({ outcome: "no" });
  ok(f.data.visit.nextStep === "No action" && f.data.visit.followUp === "", "no follow-up when not interested");
  f = await mk({ outcome: "order", value: 500, photo: "/photos/2026-11-15/abcd1234.jpg" });
  ok(f.data.visit.nextStep === "Deliver order" && f.data.visit.photo.startsWith("/photos/"), "order gets a delivery step and keeps its photo");
  ok((await mk({ outcome: "order", value: 500, photo: "/photos/../etc/passwd" })).data.visit.photo === "", "odd photo paths are dropped");
  for (const [id, v] of Object.entries(await store.hall("field:visits:" + today.slice(0, 7)))) if (v.shopName.startsWith("Follow Test")) { await store.hdel("field:visits:" + today.slice(0, 7), id); await store.hdel("field:shops", v.shopId); }
}

// live tracking (Android app)
{
  const now = Date.now();
  const pt = (lat, lng, secAgo, accuracy = 10) => ({ lat, lng, accuracy, t: now - secAgo * 1000 });
  ok((await call("track", { method: "POST", body: { action: "token" } })).code === 401, "tracking key needs sign-in");
  ok((await call("track", { as: "bivek", method: "POST", body: { action: "token" } })).code === 403, "view-only partner cannot be tracked");
  ok((await call("track", { method: "POST", bearer: "f".repeat(64), body: { points: [pt(27.7, 85.3, 5)] } })).code === 401, "unknown tracking key is refused");
  const tok = (await call("track", { as: "sajina", method: "POST", body: { action: "token" } })).data.token;
  ok(/^[a-f0-9]{64}$/.test(tok), "tracking key issued");
  await store.hdel("field:day:" + nepal().date, EMAIL.sajina);
  await store.hdel("field:track:" + nepal().date, EMAIL.sajina);
  let t = await call("track", { method: "POST", bearer: tok, body: { points: [pt(27.7, 85.3, 5)] } });
  ok(t.code === 200 && t.data.saved === 0 && t.data.liveOnly === true && !(await store.hget("field:track:" + nepal().date, EMAIL.sajina)), "before Start day: no route is recorded");
  ok((await store.hget("field:here", EMAIL.sajina)).lat === 27.7, "before Start day: only the latest position is kept");
  let seen = await call("state", { as: "mijesh" });
  ok(seen.data.here[EMAIL.sajina] && seen.data.here[EMAIL.sajina].lat === 27.7, "the owner sees where the phone is before Start day");
  seen = await call("state", { as: "bivek" });
  ok(Object.keys(seen.data.here || {}).length === 0, "the view-only partner does not");
  seen = await call("state", { as: "sajina" });
  ok(Object.keys(seen.data.here || {}).length === 0, "field users do not");
  await store.set("field:settings", { ...(await store.get("field:settings")), alwaysLive: false });
  t = await call("track", { method: "POST", bearer: tok, body: { points: [pt(27.7, 85.3, 4)] } });
  ok(t.data.tracking === false, "with all-day sharing off, the phone is told to stop until Start day");
  await store.set("field:settings", { ...(await store.get("field:settings")), alwaysLive: true });
  await call("day", { as: "sajina", method: "POST", body: { action: "start", lat: 27.7, lng: 85.3 } });
  t = await call("track", { method: "POST", bearer: tok, body: { points: [pt(27.7, 85.3, 30), pt(27.70001, 85.3, 20), pt(27.705, 85.31, 10), pt(27.71, 85.32, 5, 900), pt(999, 0, 1)] } });
  ok(t.data.tracking === true && t.data.saved === 2, "tracking keeps real movement and drops jitter, bad fixes and bad numbers");
  let st = await call("state", { as: "mijesh" });
  ok(st.data.tracks[EMAIL.sajina].length === 2 && st.data.days[EMAIL.sajina].lat === 27.705, "admin sees the route and the live dot moves");
  ok(!("tracks" in st.data) || !st.data.tracks[EMAIL.divash], "no route for someone who is not tracked");
  st = await call("state", { as: "sajina" });
  ok(Object.keys(st.data.tracks).length === 0, "a field user is not sent any travel route unless it is granted");
  await call("day", { as: "sajina", method: "POST", body: { action: "end", lat: 27.7, lng: 85.3 } });
  t = await call("track", { method: "POST", bearer: tok, body: { points: [pt(27.8, 85.4, 1)] } });
  ok(t.data.liveOnly === true && (await store.hget("field:track:" + nepal().date, EMAIL.sajina)).length === 2, "after End day: no more route, only the latest position");
  ok((await store.hget("field:here", EMAIL.sajina)).lat === 27.8, "after End day the owner still sees where the phone is");
}

// photos and TV
ok((await call("photo", { as: "sajina", method: "POST", body: { dataUrl: "x" } })).code === 501, "photos report not connected");
ok((await call("tv", { query: { key: "anything" } })).code === 503, "TV feed is closed until a key is set");
process.env.FIELD_TV_KEY = "a-long-secret-key";
ok((await call("tv", { query: { key: "wrong-key-wrong-k" } })).code === 401, "TV feed refuses a wrong key");
r = await call("tv", { query: { key: "a-long-secret-key" } });
ok(r.code === 200 && r.data.visits.length === 1 && !("me" in r.data), "TV feed works with the right key");

// an archived shop can be brought back by a field user at check-in
{
  const any = Object.values(await store.hall("field:shops"))[0];
  await call("shops", { as: "mijesh", method: "PATCH", body: { id: any.id, active: false } });
  const back = await call("shops", { as: "sajina", method: "POST", body: { id: any.id, action: "restore" } });
  ok(back.code === 200 && back.data.shop.active === true, "a field user can restore an archived shop");
}

// admin deletes an archived shop together with its check-ins
{
  const mk = await call("visits", { as: "sajina", method: "POST", body: { shopName: "Throwaway Shop", shopType: "Retailer", area: "Balkhu", outcome: "no", phone: "9800000123", lat: 27.684, lng: 85.298, accuracy: 10 } });
  const sid = mk.data.shop.id;
  ok((await call("admin", { as: "mijesh", method: "POST", body: { op: "deleteShop", id: sid } })).code === 400, "an active shop cannot be deleted");
  await call("shops", { as: "mijesh", method: "PATCH", body: { id: sid, active: false } });
  ok((await call("admin", { as: "sajina", method: "POST", body: { op: "deleteShop", id: sid } })).code === 403, "a field user cannot delete a shop");
  const del = await call("admin", { as: "mijesh", method: "POST", body: { op: "deleteShop", id: sid } });
  ok(del.code === 200 && del.data.visits === 1 && !(await store.hget("field:shops", sid)), "admin deletes an archived shop and its check-ins");
}

// offline check-ins: a re-send never saves twice, and the real time is kept
{
  const at = new Date(Date.now() - 3 * 3600000).toISOString();
  const body = { clientId: "c-test-1", at, shopName: "Offline Shop", shopType: "Retailer", area: "Thankot", outcome: "interested", phone: "9800000456", lat: 27.69, lng: 85.2, accuracy: 10 };
  const a = await call("visits", { as: "sajina", method: "POST", body });
  const b2 = await call("visits", { as: "sajina", method: "POST", body });
  ok(a.code === 200 && b2.code === 200 && a.data.visit.id === b2.data.visit.id, "sending the same check-in twice saves it once");
  ok(a.data.visit.time === nepal(new Date(at)).time, "a late check-in keeps the time it really happened");
  const future = await call("visits", { as: "sajina", method: "POST", body: { ...body, clientId: "c-test-2", shopName: undefined, shopId: a.data.shop.id, at: new Date(Date.now() + 86400000).toISOString() } });
  ok(future.code === 200 && future.data.visit.date === nepal().date, "a time in the future is ignored");
}

// travel routes are private
{
  const rep0 = (await call("state", { as: "sajina" })).data;
  ok(rep0.routes === "none" && Object.keys(rep0.tracks).length === 0, "a field user gets no travel routes by default");
  ok(Object.keys(rep0.days).every((e) => e.startsWith("sajina")), "a field user gets only their own location");
  const boss = (await call("state", { as: "mijesh" })).data;
  const viewer = (await call("state", { as: "bivek" })).data;
  ok(boss.routes === "team" && viewer.routes === "team", "the admin and the view-only account see all routes");
  const access = { [rep0.me.email]: "own", "x@y.z": "everything" };
  const saved = await call("admin", { as: "mijesh", method: "POST", body: { op: "saveSettings", settings: { ...boss.settings, routeAccess: access, tvRoutes: true } } });
  ok(saved.data.settings.routeAccess[rep0.me.email] === "own" && !saved.data.settings.routeAccess["x@y.z"] && saved.data.settings.tvRoutes === true, "route access is saved and junk levels are dropped");
  ok((await call("state", { as: "sajina" })).data.routes === "own", "a granted field user can see their own route");
  ok((await call("admin", { as: "sajina", method: "POST", body: { op: "saveSettings", settings: { routeAccess: { [rep0.me.email]: "team" } } } })).code === 403, "a field user cannot grant themselves access");
  const week = (await call("state", { as: "mijesh", query: { from: "2026-11-10", to: "2026-11-16" } })).data;
  const month = (await call("state", { as: "mijesh", query: { from: "2026-10-10", to: "2026-11-16" } })).data;
  ok(week.trackDays && month.trackDays === null, "routes are loaded for up to 7 days at a time");
  await call("admin", { as: "mijesh", method: "POST", body: { op: "saveSettings", settings: { ...boss.settings, routeAccess: {}, tvRoutes: false } } });
}

// the real first day: one tap clears the tests, once
{
  ok((await call("state", { as: "mijesh" })).data.launch === null, "before the start the app is in testing mode");
  ok((await call("admin", { as: "sajina", method: "POST", body: { op: "goLive", confirm: "START" } })).code === 403, "a field user cannot start field sales");
  ok((await call("admin", { as: "mijesh", method: "POST", body: { op: "goLive" } })).code === 400, "starting needs the confirm step");
  const go = await call("admin", { as: "mijesh", method: "POST", body: { op: "goLive", confirm: "START" } });
  const after = (await call("state", { as: "mijesh" })).data;
  ok(go.code === 200 && go.data.visits > 0 && after.shops.length === 0 && after.visits.length === 0, "starting clears every test shop and check-in");
  ok(after.board.month.every((r) => r.points === 0) && Object.keys(after.days).length === 0, "points and the day are back to zero");
  ok(after.launch && after.launch.date === nepal().date && after.users.length >= 3, "the team stays, and the start date is kept");
  ok((await call("admin", { as: "mijesh", method: "POST", body: { op: "goLive", confirm: "START" } })).code === 400, "it cannot be started twice");
}

// team chat
{
  for (const k of Object.keys(SID)) await store.set("field:session:" + SID[k], { email: EMAIL[k] });
  const people = await store.hall("field:users");
  for (const k of ["divash", "sajina"]) if (people[EMAIL[k]]) await store.hset("field:users", EMAIL[k], { ...people[EMAIL[k]], active: true });
  const { listen } = await import("../lib/bus.js");
  const heard = { sajina: [], mijesh: [], bivek: [] };
  const stops = Object.keys(heard).map((k) => listen(EMAIL[k], (ev) => heard[k].push(ev)));
  ok((await call("chat", { query: { op: "threads" } })).code === 401, "chat: signed-out person gets nothing");
  let c = await call("chat", { as: "divash", method: "POST", body: { op: "send", to: EMAIL.sajina, text: "  Namaste\n\n\n\nKalanki done ", id: "m_abc123x_q1w2" } });
  ok(c.code === 200 && c.data.msg.text === "Namaste\n\nKalanki done" && c.data.msg.from === EMAIL.divash, "chat: message saved, line breaks kept and tidied");
  const again = await call("chat", { as: "divash", method: "POST", body: { op: "send", to: EMAIL.sajina, text: "Namaste", id: "m_abc123x_q1w2" } });
  ok(again.data.msg.id === "m_abc123x_q1w2", "chat: a resent message is not saved twice");
  ok(heard.sajina.length === 1 && heard.sajina[0].msg.text.startsWith("Namaste"), "chat: the other person gets it live, once");
  ok(heard.mijesh.length === 1 && heard.mijesh[0].watch === true, "chat: the owner is told about team chats");
  ok(heard.bivek.length === 0, "chat: the view-only admin is not told about other people's chats");
  ok((await call("chat", { as: "divash", method: "POST", body: { op: "send", to: EMAIL.divash, text: "me" } })).code === 400, "chat: cannot message yourself");
  ok((await call("chat", { as: "divash", method: "POST", body: { op: "send", to: EMAIL.sajina, text: "   " } })).code === 400, "chat: empty message refused");
  ok((await call("chat", { as: "divash", method: "POST", body: { op: "send", to: "stranger@gmail.com", text: "hi" } })).code === 400, "chat: only people on the team list");
  let t = await call("chat", { as: "sajina", query: { op: "threads" } });
  ok(t.data.threads.length === 1 && t.data.threads[0].unread === 1 && t.data.threads[0].with === EMAIL.divash, "chat: unread count for the receiver");
  ok(t.data.all === undefined && t.data.canSeeAll === false, "chat: field users cannot see other chats");
  const pairKey = [EMAIL.divash, EMAIL.sajina].sort().join("|");
  ok((await call("chat", { as: "bivek", query: { op: "messages", pair: pairKey } })).code === 403, "chat: view-only admin cannot read other people's chats");
  ok((await call("chat", { as: "bivek", query: { op: "threads" } })).data.canSeeAll === false, "chat: view-only admin has no team chats list");
  const watch = await call("chat", { as: "mijesh", query: { op: "messages", pair: pairKey } });
  ok(watch.code === 200 && watch.data.messages.length === 1, "chat: the owner can read any conversation");
  ok((await call("chat", { as: "mijesh", query: { op: "threads" } })).data.all.some((x) => x.pair === pairKey), "chat: the owner sees every conversation in Team chats");
  ok((await call("chat", { as: "sajina", method: "POST", body: { op: "read", with: EMAIL.divash } })).code === 200, "chat: mark as read");
  t = await call("chat", { as: "sajina", query: { op: "threads" } });
  const d = await call("chat", { as: "divash", query: { op: "threads" } });
  ok(t.data.threads[0].unread === 0 && d.data.threads[0].seenByThem >= c.data.msg.at, "chat: read clears unread and shows as seen to the sender");
  const m = await call("chat", { as: "sajina", query: { op: "messages", with: EMAIL.divash } });
  ok(m.data.messages.length === 1 && m.data.seen[EMAIL.sajina] >= c.data.msg.at, "chat: conversation history comes back with read times");
  const sub = { endpoint: "https://web.push.apple.com/abc123def456", keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } };
  ok((await call("chat", { as: "mijesh", method: "POST", body: { op: "webpush", sub } })).code === 200, "chat: iPhone notification setup is saved");
  ok((await call("chat", { as: "mijesh", method: "POST", body: { op: "webpush", sub: { endpoint: "javascript:x" } } })).code === 400, "chat: a broken notification setup is refused");
  ok((await call("chat", { as: "mijesh", method: "POST", body: { op: "presence", endpoint: sub.endpoint, visible: true } })).code === 200, "chat: on-screen report accepted");
  ok((await store.hget("field:webpush", EMAIL.mijesh)).length === 1, "chat: one entry per device");
  stops.forEach((s) => s());
}

// Google refuses Android pushes whose data holds a reserved key ("from" did, and no phone rang).
{
  const { fcmData } = await import("../lib/push.js");
  const d = fcmData({ type: "chat", from: "a@b.c", pair: "x|y", notification: 1, gcm_x: 2, google_y: 3, message_type: 4 });
  ok(!("from" in d) && d.sender === "a@b.c", "push: 'from' is sent as 'sender'");
  ok(Object.keys(d).every((k) => !/^(from|notification|message_type|google.*|gcm.*)$/i.test(k)), "push: no reserved key reaches Google");
  ok(d.type === "chat" && d.pair === "x|y", "push: other keys are kept");
}

// The office TV's checks on a field day.
{
  const { watchDay, routeMetres, longStops } = await import("../shared/watch.js");
  const D = "2026-11-25"; // a Wednesday
  const at = (hm) => Math.floor(Date.parse(`${D}T${hm}:00+05:45`) / 1000);
  const A = { email: "a@x", name: "Asha Rai", color: "#0EA5A4" };
  const B = { email: "b@x", name: "Bina KC", color: "#7C3AED" };
  const shops = [{ id: "s1", name: "Ram Pharmacy", area: "Kalanki", lat: 27.7, lng: 85.3 }, { id: "s9", name: "Tea Corner", area: "Kalanki", lat: 27.75, lng: 85.35 }];
  const v = (rep, time, shopId, shopName, lat, lng, extra = {}) => ({ id: rep + time, date: D, rep, time, shopId, shopName, lat, lng, outcome: "interested", value: 0, photo: "/p.jpg", ...extra });
  // A walks east 1 km, then sits 40 min at the tea shop, then the phone goes quiet.
  const lineA = [[27.7, 85.3, at("10:00")], [27.7, 85.305, at("10:10")], [27.7, 85.31, at("10:20")]];
  for (let m = 0; m <= 40; m += 5) lineA.push([27.75, 85.35 + m * 1e-6, at("11:00") + m * 60]);
  const visits = [
    v(A.email, "12:30", "s1", "Ram Pharmacy", 27.7, 85.3, { outcome: "order", value: 5000, first: true, newShop: true }),
    v(A.email, "12:33", "s2", "Far Mart", 27.8, 85.4), // 13 km in 3 min
    v(B.email, "12:35", "s3", "Next Door", 27.7005, 85.3005, { photo: "" }),
    v(B.email, "12:50", "s4", "Corner", 27.8003, 85.4003),
  ];
  const out = watchDay({ date: D, nowSec: at("14:00"), users: [A, B], visits, days: { [A.email]: { start: "09:55" }, [B.email]: { start: "09:58", mock: 4, mockAt: "11:02" } }, tracks: { [A.email]: lineA }, shops, dailyVisits: 12 });
  const kinds = (rep) => out.alerts.filter((x) => x.rep === rep).map((x) => x.kind);
  const a = out.reps.find((r) => r.email === A.email);
  ok(Math.abs(routeMetres(lineA.slice(0, 3)) - 990) < 30, "tv: route distance in metres");
  ok(a.metres > 900 && a.orders === 1 && a.amount === 5000 && a.visits === 2, "tv: km, orders and amount per person");
  ok(longStops(lineA).length === 1, "tv: a 40-minute stop is found");
  ok(kinds(A.email).includes("stop") && out.alerts.find((x) => x.kind === "stop").detail.includes("Tea Corner"), "tv: long stop with no check-in names the nearby place");
  ok(kinds(A.email).includes("jump"), "tv: 13 km in 3 minutes is flagged");
  ok(kinds(A.email).includes("quiet"), "tv: phone location silent is flagged");
  ok(kinds(A.email).includes("latefirst"), "tv: first shop after noon is flagged");
  ok(kinds(B.email).includes("mock") && out.alerts[0].level === "high", "tv: fake-GPS app is flagged first");
  ok(kinds(B.email).includes("photo"), "tv: check-in without photo is noted");
  ok(out.alerts.some((x) => x.kind === "together"), "tv: two people working the same streets");
  ok(out.team.amount === 5000 && out.team.visits === 4, "tv: team totals");
  // Check-in far from where the phone actually was.
  const lineC = [[27.7, 85.3, at("13:00")]];
  const c = watchDay({ date: D, nowSec: at("13:05"), users: [A], visits: [v(A.email, "13:00", "s1", "Ram Pharmacy", 27.72, 85.3)], days: { [A.email]: { start: "09:00" } }, tracks: { [A.email]: lineC }, shops });
  ok(c.alerts.some((x) => x.kind === "away"), "tv: check-in 2 km from the live route is flagged");
  ok(!c.alerts.some((x) => x.kind === "stop"), "tv: no stop alert without a long stay");
  // Saturday is the day off: no lateness checks.
  const sat = watchDay({ date: "2026-11-28", nowSec: Math.floor(Date.parse("2026-11-28T14:00:00+05:45") / 1000), users: [A], visits: [], days: {}, tracks: {}, shops });
  ok(sat.alerts.length === 0 && sat.reps[0].status.kind === "off", "tv: Saturday has no time alerts");
}

// Orders cancelled in CRM come off sales, and the board is ranked by sales.
{
  const { scoreboard } = await import("../shared/rules.js");
  const people = [{ email: "a@x", name: "Asha" }, { email: "b@x", name: "Bina" }];
  const P = { visit: 1, newShop: 1, firstOrder: 10, repeatOrder: 5 };
  const vs = [
    { rep: "a@x", date: "2026-11-25", outcome: "order", value: 5000, first: true },
    { rep: "a@x", date: "2026-11-25", outcome: "order", value: 9000, first: true, cancelled: true },
    { rep: "b@x", date: "2026-11-25", outcome: "order", value: 7000, first: false },
  ];
  const rows = scoreboard(vs, people, P);
  const a = rows.find((r) => r.email === "a@x");
  ok(a.value === 5000 && a.orders === 1 && a.cancelled === 1 && a.visits === 2, "board: cancelled order keeps the visit, loses the money");
  ok(rows[0].email === "b@x", "board: ranked by sales, not points");
  ok(a.points === 1 + 10 + 1, "board: cancelled order earns no order points");
}
{
  const { checkCancellations } = await import("../lib/cancels.js");
  ok((await checkCancellations({ force: true })).checked === 0, "cancel check: does nothing when CRM is not connected");
  // CRM connected (faked): one order cancelled, one deleted, one delivered.
  const { nepal } = await import("../lib/time.js");
  const m = nepal().month;
  await store.hset("field:visits:" + m, "c1", { id: "c1", date: m + "-02", rep: "a@x", outcome: "order", value: 100, soId: "111" });
  await store.hset("field:visits:" + m, "c2", { id: "c2", date: m + "-02", rep: "a@x", outcome: "order", value: 200, soId: "222" });
  await store.hset("field:visits:" + m, "c3", { id: "c3", date: m + "-02", rep: "a@x", outcome: "order", value: 300, soId: "333" });
  const realFetch = globalThis.fetch;
  process.env.ZOHO_FIELD_API_KEY = "https://www.zohoapis.com/crm/v7/functions/field_shop_visit/actions/execute?auth_type=apikey&zapikey=test";
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ code: "success", details: { output: JSON.stringify({ statuses: { 111: "Cancelled", 222: "Deleted", 333: "Delivered" } }) } }) });
  const res = await checkCancellations({ force: true });
  globalThis.fetch = realFetch;
  delete process.env.ZOHO_FIELD_API_KEY;
  const g = await store.hall("field:visits:" + m);
  ok(res.changed === 2 && g.c1.cancelled && g.c2.cancelled && !g.c3.cancelled && g.c3.soStatus === "Delivered", "cancel check: cancelled and deleted CRM orders are marked, delivered stays");
  for (const id of ["c1", "c2", "c3"]) await store.hdel?.("field:visits:" + m, id);
}

// Distance: cleaned like fitness apps (no jitter, spikes, teleports or rough network spots).
{
  const { routeDistance, cleanRoute } = await import("../shared/distance.js");
  const t0 = 1795588000;
  const walk = []; // 1 km due north in 25 m steps, 15 s apart
  for (let i = 0; i <= 40; i++) walk.push([27.70 + i * 0.000225, 85.30, t0 + i * 15]);
  const w = routeDistance(walk);
  ok(Math.abs(w - 1000) < 30, "distance: a straight 1 km walk is about 1 km (" + w + " m)");
  const shop = []; // 20 minutes inside a shop, GPS wobbling 30 m
  for (let i = 0; i < 40; i++) shop.push([27.71 + (i % 2 ? 0.00027 : 0) + i * 1e-6, 85.30 + (i % 3 ? 0.0002 : 0), t0 + 2000 + i * 30]);
  ok(routeDistance(shop) < 40, "distance: wobble while standing in a shop adds nothing");
  const spike = walk.slice(0, 20).concat([[27.72, 85.32, t0 + 20 * 15 + 5]], walk.slice(20).map((p) => [p[0], p[1], p[2] + 10]));
  ok(Math.abs(routeDistance(spike) - w) < 40, "distance: a GPS jump out and back is ignored");
  const net = walk.slice();
  for (let i = 0; i < 6; i++) net.push([27.75, 85.35, t0 + 1000 + i * 60], [27.751, 85.352, t0 + 1030 + i * 60]);
  ok(Math.abs(routeDistance(net.sort((a, b) => a[2] - b[2])) - w) < 40, "distance: rough network spots repeating again and again are ignored");
  const weak = walk.map((p, i) => (i === 10 ? [p[0] + 0.003, p[1], p[2], 120] : [...p, 8]));
  ok(Math.abs(routeDistance(weak) - w) < 40, "distance: a weak fix (±120 m) is ignored");
  const gap = [[27.70, 85.30, t0], [27.70, 85.30, t0 + 60]];
  ok(Math.abs(routeDistance(gap, [[27.709, 85.30, t0 + 600]]) - 1000) < 20, "distance: check-ins fill gaps in the route");
  ok(cleanRoute(shop).length === 1, "distance: a stop becomes one point on the map");
}

console.log(`All ${passed} checks passed.`);
