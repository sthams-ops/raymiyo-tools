// Every call the screens make to the server, in one place.
async function call(path, options = {}) {
  // On a weak signal a request can hang for minutes. Give up after a while so
  // the app can keep the work on the phone and send it later.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), path.startsWith("/api/photo") ? 45000 : 20000);
  let res;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal: stop.signal,
      ...options,
    });
  } catch {
    const err = new Error("No signal. Check your internet and try again.");
    err.offline = true;
    throw err;
  } finally {
    clearTimeout(timer);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `The server answered ${res.status}. Try again.`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
const send = (method, path, body) => call(path, { method, body: JSON.stringify(body) });

export const api = {
  state: (from, to) => call("/api/state" + (from && to ? `?from=${from}&to=${to}` : "")),
  tv: (key) => call("/api/tv?key=" + encodeURIComponent(key)),
  day: (action, pos) => send("POST", "/api/day", { action, ...pos }),
  createVisit: (visit) => send("POST", "/api/visits", visit),
  updateVisit: (visit) => send("PATCH", "/api/visits", visit),
  deleteVisit: (id) => call("/api/visits?id=" + encodeURIComponent(id), { method: "DELETE" }),
  shopDone: (id) => send("POST", "/api/shops", { id, action: "done" }),
  shopAct: (id, action, extra) => send("POST", "/api/shops", { id, action, ...extra }),
  saveShop: (shop) => send("PATCH", "/api/shops", shop),
  admin: (op, payload) => send("POST", "/api/admin", { op, ...payload }),
  trackToken: () => send("POST", "/api/track", { action: "token" }),
  photo: (dataUrl) => send("POST", "/api/photo", { dataUrl }),
  chatThreads: () => call("/api/chat?op=threads"),
  chatMessages: (q) => call("/api/chat?op=messages&" + new URLSearchParams(q).toString()),
  chatSend: (to, text, id) => send("POST", "/api/chat", { op: "send", to, text, id }),
  chatRead: (who) => send("POST", "/api/chat", { op: "read", with: who }),
  chatPush: (token, remove) => send("POST", "/api/chat", { op: "push", token, remove: !!remove }),
};
