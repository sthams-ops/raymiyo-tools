// Chat notifications on the Android app. The phone gets a Firebase token,
// the server keeps it, and new messages then ring the phone even when the
// app is closed. Older app versions without the push part simply skip this.
import { Capacitor, registerPlugin } from "@capacitor/core";
import { api } from "./api.js";

const Push = registerPlugin("PushNotifications");
const TOKEN_KEY = "field.pushToken";

export const pushReady = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications");

let started = false;
export async function startPush(onOpen) {
  if (!pushReady() || started) return;
  started = true;
  try {
    // Tapping a notification opens that person's chat.
    await Push.addListener("pushNotificationActionPerformed", (action) => {
      const d = (action && action.notification && action.notification.data) || {};
      if (d.from) onOpen(d.from);
    });
    await Push.addListener("registration", (t) => {
      try {
        localStorage.setItem(TOKEN_KEY, t.value);
      } catch {}
      api.chatPush(t.value).catch(() => {});
    });
    await Push.addListener("registrationError", (e) => console.warn("Push registration failed", e && e.error));
    let perm = await Push.checkPermissions();
    if (perm.receive !== "granted") perm = await Push.requestPermissions();
    if (perm.receive !== "granted") return;
    await Push.register();
  } catch (e) {
    console.warn("Push setup failed", e);
  }
}

// Reading a chat clears its notification, and with it the number on the app icon.
export async function clearNotices(pair) {
  if (!pushReady()) return;
  try {
    const { notifications } = await Push.getDeliveredNotifications();
    const done = (notifications || []).filter((n) => n.tag === pair || (n.data && n.data.pair === pair));
    if (done.length) await Push.removeDeliveredNotifications({ notifications: done });
  } catch {}
}

// Signing out: this phone stops getting that person's messages.
export async function forgetPush() {
  let token = "";
  try {
    token = localStorage.getItem(TOKEN_KEY) || "";
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  if (token) await api.chatPush(token, true).catch(() => {});
  if (pushReady()) await Push.removeAllDeliveredNotifications().catch(() => {});
}
