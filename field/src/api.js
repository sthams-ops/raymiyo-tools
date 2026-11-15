// Every call the screens make to the server, in one place.
async function call(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(data.error || `The server answered ${res.status}. Try again.`);
    err.status = res.status;
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
  saveShop: (shop) => send("PATCH", "/api/shops", shop),
  admin: (op, payload) => send("POST", "/api/admin", { op, ...payload }),
  trackToken: () => send("POST", "/api/track", { action: "token" }),
  photo: (dataUrl) => send("POST", "/api/photo", { dataUrl }),
};
