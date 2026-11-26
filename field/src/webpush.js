// Chat notifications for the iPhone home-screen app and desktop browsers
// (Web Push). The Android app uses Firebase instead (push.js).
// iPhone only allows this for the app added with Share → Add to Home Screen,
// on iOS 16.4 or newer, and only after a tap on a button (enableWebPush).
import { Capacitor } from "@capacitor/core";
import { api } from "./api.js";

const isNative = () => Capacitor.isNativePlatform();
const isIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => window.navigator.standalone === true || (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);

// What the chat window should say about notifications on this device.
//   on | off (can be turned on) | blocked | home (iPhone: add to Home Screen first) | old (iPhone too old) | none (not possible here)
export function webPushStatus() {
  if (isNative()) return "none";
  const hasApi = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIPhone() && !standalone()) return "home";
  if (!hasApi) return isIPhone() ? "old" : "none";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission === "granted") return "on";
  return "off";
}

function keyBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

let endpoint = "";

// The service worker, or nothing after a few seconds (it may not exist here).
const worker = () => ("serviceWorker" in navigator ? Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 4000))]) : Promise.resolve(null));

async function subscribe(vapid) {
  const reg = await worker();
  if (!reg) throw new Error("This app is still loading. Close it, open it again and try once more.");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) });
  const json = sub.toJSON();
  endpoint = json.endpoint;
  try {
    localStorage.setItem("field.webpush", endpoint);
  } catch {}
  await api.chatWebPush(json);
  return true;
}

// Must run from a tap: iPhone refuses the question otherwise.
export async function enableWebPush(vapid) {
  if (!vapid) throw new Error("Notifications are not set up on the server yet.");
  const answer = await Notification.requestPermission();
  if (answer !== "granted") return false;
  return subscribe(vapid);
}

// Each time the app opens: keep the server's copy of this device fresh.
export async function refreshWebPush(vapid) {
  if (!vapid || webPushStatus() !== "on") return;
  try {
    await subscribe(vapid);
  } catch {}
}

// Tells the server whether the app is on screen, so this device is not rung for
// messages it can already see.
export function reportPresence() {
  if (!endpoint) return;
  api.chatPresence(endpoint, document.visibilityState === "visible").catch(() => {});
}

// Reading a chat removes its notifications from this device.
export async function clearWebNotices(tag) {
  if (isNative() || !("serviceWorker" in navigator) || !("getNotifications" in ServiceWorkerRegistration.prototype)) return;
  try {
    const reg = await worker();
    if (!reg) return;
    const list = await reg.getNotifications(tag ? { tag } : undefined);
    list.forEach((n) => n.close());
  } catch {}
}

// Signing out: this device stops getting that person's messages.
export async function forgetWebPush() {
  let ep = "";
  try {
    ep = localStorage.getItem("field.webpush") || "";
    localStorage.removeItem("field.webpush");
  } catch {}
  if (ep) await api.chatWebPush(null, ep).catch(() => {});
  try {
    const reg = await worker();
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
  } catch {}
}
