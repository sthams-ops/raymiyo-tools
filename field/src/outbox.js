// Offline mode. Anything a field user saves goes through here.
//   With signal:    it is sent straight away.
//   Without signal: it is kept on the phone (IndexedDB) and sent later, in the
//                   same order, when the signal is back.
// Every item carries a clientId, so the server never saves the same thing twice,
// and the time it really happened, so a late check-in still shows the right time.
import { api } from "./api.js";

const DB = "raymiyo-field";
const STORE = "outbox";
const LAST_STATE = "field:lastState";
const SHOP_MAP = "field:localShops";

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  }
  return dbPromise;
}
async function tx(mode, work) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const req = work(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const listeners = new Set();
let cache = [];
async function refresh() {
  try {
    cache = ((await tx("readonly", (s) => s.getAll())) || []).sort((a, b) => a.at.localeCompare(b.at));
  } catch {
    cache = [];
  }
  listeners.forEach((fn) => fn(cache));
  return cache;
}
export function watchOutbox(fn) {
  listeners.add(fn);
  fn(cache);
  return () => listeners.delete(fn);
}
export const loadOutbox = refresh;
export const discard = async (id) => {
  await tx("readwrite", (s) => s.delete(id));
  await refresh();
};

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^\w-]/g, "");
const isOffline = (e) => !e.status || e.status >= 500 || e.status === 408 || e.status === 429;

// Shops added without signal get a temporary id on the phone. Once the server
// has saved the shop, later check-ins at it are pointed to the real one.
function shopMap() {
  try {
    return JSON.parse(localStorage.getItem(SHOP_MAP)) || {};
  } catch {
    return {};
  }
}
function mapShop(localId, realId) {
  try {
    localStorage.setItem(SHOP_MAP, JSON.stringify({ ...shopMap(), [localId]: realId }));
  } catch {}
}
export const localShopId = (itemId) => "local-" + itemId;

async function deliver(item) {
  const extra = { clientId: item.id, at: item.at };
  let photo = item.photoUrl || "";
  if (item.photoData && !photo) {
    try {
      photo = (await api.photo(item.photoData)).url;
      item.photoUrl = photo;
    } catch (e) {
      if (isOffline(e)) throw e;
      if (item.photoNeeded) throw e;
    }
  }
  if (item.kind === "day") return api.day(item.body.action, { ...item.body, ...extra });
  if (item.kind === "visit") {
    const body = { ...item.body, photo, ...extra };
    if (String(body.shopId || "").startsWith("local-")) {
      const real = shopMap()[body.shopId];
      if (!real) {
        const e = new Error("The shop this check-in belongs to has not been saved yet.");
        e.status = 424;
        throw e;
      }
      body.shopId = real;
    }
    try {
      const out = await api.createVisit(body);
      if (!item.body.shopId && out.shop) mapShop(localShopId(item.id), out.shop.id);
      return out;
    } catch (e) {
      // Someone else saved the same shop meanwhile: check in at that one instead.
      if (e.status === 409 && e.data && e.data.duplicate && !item.body.shopId) {
        const out = await api.createVisit({ ...body, shopId: e.data.duplicate, shopName: undefined, clientId: item.id + "-b" });
        mapShop(localShopId(item.id), e.data.duplicate);
        return out;
      }
      throw e;
    }
  }
  if (item.kind === "act") {
    const more = { ...item.body.extra };
    if (more.pay) more.pay = { ...more.pay, photo };
    return api.shopAct(item.body.shopId, item.body.action, { ...more, ...extra });
  }
  throw new Error("Unknown item");
}

// Tries now. If there is no signal the item is kept and { queued: true } comes back.
export async function submit(kind, body, { user, label, photoData = "", photoNeeded = false } = {}) {
  const item = { id: newId(), kind, body, user, label: label || "", photoData, photoNeeded, at: new Date().toISOString(), tries: 0, error: "" };
  if (navigator.onLine !== false && !cache.some((i) => i.user === user && !i.error)) {
    try {
      return { out: await deliver(item), item };
    } catch (e) {
      if (!isOffline(e)) throw e;
    }
  }
  await tx("readwrite", (s) => s.put(item));
  await refresh();
  if (navigator.onLine !== false) flush(user).catch(() => {});
  return { queued: true, item };
}

// Sends everything that is waiting, oldest first. Stops at the first item that
// fails for lack of signal; an item the server refuses is kept with its reason.
let flushing = null;
export function flush(user) {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const item of await refresh()) {
      if (item.user !== user) continue;
      try {
        await deliver(item);
        await tx("readwrite", (s) => s.delete(item.id));
        sent += 1;
      } catch (e) {
        if (e.status === 401) break;
        item.tries += 1;
        if (isOffline(e)) {
          await tx("readwrite", (s) => s.put(item));
          break;
        }
        item.error = e.message || "The server refused this.";
        await tx("readwrite", (s) => s.put(item));
      }
    }
    await refresh();
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// The last screen data the server gave, kept so the app opens without signal.
export function saveState(data) {
  try {
    localStorage.setItem(LAST_STATE, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}
export function savedState() {
  try {
    const kept = JSON.parse(localStorage.getItem(LAST_STATE));
    if (!kept || !kept.data || !kept.data.me) return null;
    // Saved on an earlier day: keep the shops and products, start today's numbers from zero.
    const today = new Date(Date.now() + 345 * 60000).toISOString().slice(0, 10);
    const d = kept.data;
    if (d.today !== today) {
      const zero = (rows) => (rows || []).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "number" ? 0 : v])));
      kept.data = { ...d, today, days: {}, tracks: {}, board: { ...d.board, today: zero(d.board && d.board.today) } };
    }
    return kept;
  } catch {
    return null;
  }
}

// What the screen shows while items wait: the day looks started, and shops
// added without signal can be found and checked in at again.
export function withOutbox(data, items) {
  const mine = items.filter((i) => i.user === data.me.email && !i.error);
  if (!mine.length) return data;
  const days = { ...data.days };
  const shops = [...data.shops];
  const hhmm = (iso) => new Date(new Date(iso).getTime() + 345 * 60000).toISOString().slice(11, 16);
  for (const i of mine) {
    if (i.kind === "day") {
      const d = { ...(days[data.me.email] || {}) };
      if (i.body.action === "start") Object.assign(d, { start: d.start || hhmm(i.at), end: "" });
      if (i.body.action === "end") Object.assign(d, { start: d.start || hhmm(i.at), end: hhmm(i.at) });
      days[data.me.email] = d;
    }
    if (i.kind === "visit" && !i.body.shopId) {
      shops.push({ id: localShopId(i.id), name: i.body.shopName, type: i.body.shopType, area: i.body.area, phone: String(i.body.phone || "").replace(/\D/g, ""), lat: i.body.lat, lng: i.body.lng, owner: data.me.email, orders: 0, stage: "Prospect", active: true, pending: true });
    }
  }
  return { ...data, days, shops };
}
