// Chat notifications for the home-screen app on iPhone (iOS 16.4 or newer)
// and for desktop browsers, through the standard Web Push service.
// The phone shows the message and the number of unread messages on the app
// icon, even when the app is closed.
//
// Setup: Railway variables VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (one key pair
// made once with web-push), and optionally VAPID_SUBJECT (a mailto: address).
//
// Storage: field:webpush  hash  email -> [{ endpoint, keys, at }]  (newest 6)
import webpush from "web-push";
import { store } from "./store.js";

const KEY = "field:webpush";
const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
let ready = false;
if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:mijesh.shrestha@unijoynepal.com", publicKey, privateKey);
    ready = true;
  } catch (e) {
    console.error("Web push keys are not valid:", e.message);
  }
}
export const webPushKey = () => (ready ? publicKey : "");

// Which devices have the app open on screen right now. Those get the message
// live inside the app, so their phone does not ring a second time.
const onScreen = globalThis.__fieldOnScreen || (globalThis.__fieldOnScreen = new Map());
export function setOnScreen(endpoint, visible) {
  if (!endpoint) return;
  if (visible) onScreen.set(endpoint, Date.now());
  else onScreen.delete(endpoint);
}
const isOnScreen = (endpoint) => {
  const at = onScreen.get(endpoint);
  return !!at && Date.now() - at < 75000;
};

const validSub = (s) =>
  s && typeof s.endpoint === "string" && /^https:\/\/[^\s]{10,800}$/.test(s.endpoint) && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;

// A device signs in: it now belongs to this person only.
export async function saveWebPush(email, sub) {
  if (!validSub(sub)) return false;
  const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  const all = await store.hall(KEY);
  for (const [who, list] of Object.entries(all)) {
    if (who !== email && Array.isArray(list) && list.some((s) => s.endpoint === clean.endpoint)) {
      await store.hset(KEY, who, list.filter((s) => s.endpoint !== clean.endpoint));
    }
  }
  const mine = (all[email] || []).filter((s) => s.endpoint !== clean.endpoint);
  mine.push({ ...clean, at: Date.now() });
  await store.hset(KEY, email, mine.slice(-6));
  return true;
}

export async function dropWebPush(email, endpoint) {
  const mine = (await store.hget(KEY, email)) || [];
  await store.hset(KEY, email, mine.filter((s) => s.endpoint !== endpoint));
}

// Sends to every device of this person that is not showing the app right now.
export async function webPushTo(email, payload) {
  if (!ready) return { sent: 0, off: true };
  const list = (await store.hget(KEY, email)) || [];
  let sent = 0;
  const dead = [];
  for (const s of list) {
    if (isOnScreen(s.endpoint)) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 86400, urgency: "high" });
      sent += 1;
    } catch (e) {
      // 404/410: the app was removed or notifications turned off. Forget that device.
      if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint);
      else console.error("Web push failed", e.statusCode || "", (e.body || e.message || "").toString().slice(0, 200));
    }
  }
  if (dead.length) {
    const fresh = ((await store.hget(KEY, email)) || []).filter((s) => !dead.includes(s.endpoint));
    await store.hset(KEY, email, fresh);
  }
  return { sent };
}
