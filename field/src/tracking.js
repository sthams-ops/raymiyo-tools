// Live tracking. Only does anything inside the Android app (not in a browser,
// not on iPhone home-screen installs). While signed in, the phone reports its
// position as the person moves, even with the screen off. Between Start day and
// End day that is the recorded route; outside it the server keeps only the latest
// position for the owner. Android shows a permanent notification while this runs.
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { api } from "./api.js";

export const isAndroidApp = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

const Geo = registerPlugin("BackgroundGeolocation");
const Notices = registerPlugin("LocalNotifications");

const TOKEN_KEY = "field.trackToken";
const QUEUE_KEY = "field.trackQueue";
const SEND_EVERY_MS = 20000; // send at most this often
const MAX_QUEUE = 600; // points kept while there is no internet

let watcherId = null;
let starting = false;
let queue = load(QUEUE_KEY, []);
let lastSend = 0;
let sending = false;
let onProblem = () => {};

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function token(forceNew) {
  let t = forceNew ? null : load(TOKEN_KEY, null);
  if (!t) {
    t = (await api.trackToken()).token;
    save(TOKEN_KEY, t);
  }
  return t;
}

// Sent with the phone's own networking, because Android slows down web
// requests from an app that has been in the background for a few minutes.
async function flush(force) {
  if (sending || !queue.length) return;
  if (!force && Date.now() - lastSend < SEND_EVERY_MS) return;
  sending = true;
  lastSend = Date.now();
  const batch = queue.slice(0, 200);
  try {
    const res = await CapacitorHttp.post({
      url: window.location.origin + "/api/track",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) },
      data: { points: batch },
      connectTimeout: 15000,
      readTimeout: 15000,
    });
    if (res.status === 200) {
      queue = queue.slice(batch.length);
      save(QUEUE_KEY, queue);
      if (res.data && res.data.tracking === false) await stopTracking();
    } else if (res.status === 401) {
      // Key expired or was replaced: fetch a new one next time the app is open.
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // No internet: the points stay in the queue and go out with the next batch.
  } finally {
    sending = false;
  }
}

export async function startTracking(report) {
  if (!isAndroidApp() || watcherId || starting) return;
  starting = true;
  if (report) onProblem = report;
  try {
    await token(); // while the app is open and signed in
    // Android 13+ needs permission to show the "tracking is on" notification.
    try {
      const p = await Notices.checkPermissions();
      if (p.display !== "granted") await Notices.requestPermissions();
    } catch {}
    watcherId = await Geo.addWatcher(
      {
        backgroundTitle: "Raymiyo Field is on",
        backgroundMessage: "Your location is shared with the office while you are signed in.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 25,
      },
      (location, error) => {
        if (error) {
          if (error.code === "NOT_AUTHORIZED") onProblem("Location is switched off for this app. Allow it in the phone settings so the office can see your route.", () => Geo.openSettings());
          return;
        }
        if (!location) return;
        // simulated: Android says the position came from a fake-GPS (mock location) app.
        queue.push({ lat: location.latitude, lng: location.longitude, accuracy: Math.round(location.accuracy || 0), t: location.time || Date.now(), ...(location.simulated ? { mock: 1 } : {}) });
        if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
        save(QUEUE_KEY, queue);
        flush(false);
      }
    );
  } catch (e) {
    onProblem("Live tracking could not start: " + (e && e.message ? e.message : "unknown problem"));
  } finally {
    starting = false;
  }
}

export async function stopTracking() {
  if (!isAndroidApp()) return;
  const id = watcherId;
  watcherId = null;
  if (id) {
    try {
      await Geo.removeWatcher({ id });
    } catch {}
  }
  await flush(true);
  queue = [];
  save(QUEUE_KEY, queue);
}

export const trackingOn = () => !!watcherId;
