// Phone notifications for chat, through Google's Firebase Cloud Messaging.
// They reach the Android app even when it is closed: the phone plays the
// Raymiyo ding and shows the number of unread messages on the app icon.
//
// Setup: the Railway variable FIREBASE_SERVICE_ACCOUNT holds the service
// account key file from Firebase (Project settings → Service accounts →
// Generate new private key), pasted as the whole JSON text.
// Without it nothing is sent and chat works as before.
//
// Storage: field:push  hash  email -> [{ token, at }]  (one per phone, newest 5)
import crypto from "node:crypto";
import { store } from "./store.js";

const KEY = "field:push";

function readAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    return json.client_email && json.private_key && json.project_id ? json : null;
  } catch {
    console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
    return null;
  }
}
const account = readAccount();
export const pushEnabled = () => !!account;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// A Google access token, made from the service account and kept for an hour.
let cached = { token: "", until: 0 };
async function accessToken() {
  if (cached.token && Date.now() < cached.until) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64url(crypto.sign("RSA-SHA256", Buffer.from(`${head}.${claim}`), account.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claim}.${sig}` }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.access_token) throw new Error("Firebase sign-in failed: " + (out.error_description || out.error || res.status));
  cached = { token: out.access_token, until: Date.now() + (Number(out.expires_in) || 3600) * 1000 - 120000 };
  return cached.token;
}

// One phone signs in: its token belongs to this person only. An office phone
// passed to someone else stops getting the previous person's messages.
export async function savePushToken(email, token) {
  const all = await store.hall(KEY);
  for (const [who, list] of Object.entries(all)) {
    if (who !== email && Array.isArray(list) && list.some((t) => t.token === token)) {
      await store.hset(KEY, who, list.filter((t) => t.token !== token));
    }
  }
  const mine = (all[email] || []).filter((t) => t.token !== token);
  mine.push({ token, at: Date.now() });
  await store.hset(KEY, email, mine.slice(-5));
}

export async function dropPushToken(email, token) {
  const mine = (await store.hget(KEY, email)) || [];
  await store.hset(KEY, email, mine.filter((t) => t.token !== token));
}

// Google refuses a push whose data has a reserved key ("from", "notification",
// "message_type", or one starting with "google" or "gcm"): the whole message
// fails with 400 and the phone never rings. "from" becomes "sender".
const RESERVED = /^(from|notification|message_type|google.*|gcm.*)$/i;
export function fcmData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) out[RESERVED.test(k) ? (k.toLowerCase() === "from" ? "sender" : "app_" + k) : k] = String(v);
  return out;
}

// Sends one notification to every phone of this person.
//   tag   one notification per conversation; a newer message replaces the older one
//   count unread messages in that conversation, shown as the number on the app icon
export async function pushTo(email, { title, body, tag, count, data }) {
  if (!account) return { sent: 0, off: true };
  const list = (await store.hget(KEY, email)) || [];
  if (!list.length) return { sent: 0 };
  const token = await accessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
  const strData = fcmData(data);
  let sent = 0;
  const dead = [];
  for (const t of list) {
    const message = {
      token: t.token,
      notification: { title, body },
      data: strData,
      android: {
        priority: "HIGH",
        ttl: "86400s",
        notification: {
          channel_id: "chat_v3",
          tag,
          sound: "raymiyo_soft",
          icon: "ic_stat_chat",
          color: "#38645B",
          notification_count: Math.max(1, Number(count) || 1),
          notification_priority: "PRIORITY_HIGH",
          default_vibrate_timings: true,
          visibility: "PRIVATE",
        },
      },
    };
    try {
      const res = await fetch(url, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      if (res.ok) sent += 1;
      else {
        const err = await res.json().catch(() => ({}));
        const code = JSON.stringify(err);
        // The app was removed or the phone signed out: forget that token.
        if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(code)) dead.push(t.token);
        else console.error("Push failed", res.status, code.slice(0, 300));
      }
    } catch (e) {
      console.error("Push failed", e.message);
    }
  }
  if (dead.length) {
    const fresh = ((await store.hget(KEY, email)) || []).filter((t) => !dead.includes(t.token));
    await store.hset(KEY, email, fresh);
  }
  return { sent };
}
