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
for (const name of ["state", "visits", "shops", "day", "admin", "tv", "photo", "track"]) api[name] = (await import(`../api/${name}.js`)).default;

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
r = await call("visits", { as: "divash", method: "POST", body: { shopName: "Test Kirana", shopType: "Retailer", area: "Kalimati", outcome: "order", value: 8400, terms: "Cash", brands: ["Chicool", "Made up"], note: "  two   cartons ", ...KALIMATI } });
ok(r.code === 200 && r.data.visit.newShop && r.data.visit.first, "new shop with a first order saves");
ok(r.data.visit.brands.join() === "Chicool" && r.data.visit.note === "two cartons", "brands and note are cleaned");
ok(r.data.shop.stage === "First Order" && r.data.shop.orders === 1 && r.data.shop.owner === EMAIL.divash, "shop stage and owner set");
const shopId = r.data.shop.id;
const visit1 = r.data.visit.id;

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
  ok(t.code === 200 && t.data.tracking === false && t.data.saved === 0, "nothing is tracked before Start day");
  await call("day", { as: "sajina", method: "POST", body: { action: "start", lat: 27.7, lng: 85.3 } });
  t = await call("track", { method: "POST", bearer: tok, body: { points: [pt(27.7, 85.3, 30), pt(27.70001, 85.3, 20), pt(27.705, 85.31, 10), pt(27.71, 85.32, 5, 900), pt(999, 0, 1)] } });
  ok(t.data.tracking === true && t.data.saved === 2, "tracking keeps real movement and drops jitter, bad fixes and bad numbers");
  let st = await call("state", { as: "mijesh" });
  ok(st.data.tracks[EMAIL.sajina].length === 2 && st.data.days[EMAIL.sajina].lat === 27.705, "admin sees the route and the live dot moves");
  ok(!("tracks" in st.data) || !st.data.tracks[EMAIL.divash], "no route for someone who is not tracked");
  st = await call("state", { as: "sajina" });
  ok(Object.keys(st.data.tracks).join() === EMAIL.sajina, "field user only receives their own route");
  await call("day", { as: "sajina", method: "POST", body: { action: "end", lat: 27.7, lng: 85.3 } });
  t = await call("track", { method: "POST", bearer: tok, body: { points: [pt(27.8, 85.4, 1)] } });
  ok(t.data.tracking === false && (await store.hget("field:track:" + nepal().date, EMAIL.sajina)).length === 2, "tracking stops at End day");
}

// photos and TV
ok((await call("photo", { as: "sajina", method: "POST", body: { dataUrl: "x" } })).code === 501, "photos report not connected");
ok((await call("tv", { query: { key: "anything" } })).code === 503, "TV feed is closed until a key is set");
process.env.FIELD_TV_KEY = "a-long-secret-key";
ok((await call("tv", { query: { key: "wrong-key-wrong-k" } })).code === 401, "TV feed refuses a wrong key");
r = await call("tv", { query: { key: "a-long-secret-key" } });
ok(r.code === 200 && r.data.visits.length === 1 && !("me" in r.data), "TV feed works with the right key");

console.log(`All ${passed} checks passed.`);
