// Raymiyo Field service worker. It keeps a copy of the app itself (screens,
// styles, logo, fonts) on the phone so the app still opens with no signal.
// It never stores answers from /api: live data always comes from the server,
// and work done without signal is kept by the app itself (src/outbox.js).
const SHELL = "field-shell-v1";
const FONTS = "field-fonts-v1";

async function warm() {
  const cache = await caches.open(SHELL);
  const list = await (await fetch("/shell.json", { cache: "no-store" })).json();
  const want = new Set(["/", ...list.files]);
  const have = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  await Promise.all([...want].filter((p) => p === "/" || !have.has(p)).map((p) => cache.add(new Request(p, { cache: "reload" })).catch(() => {})));
  // Drop files from older versions of the app.
  for (const req of await cache.keys()) if (!want.has(new URL(req.url).pathname)) await cache.delete(req);
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(warm().catch(() => {}));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== SHELL && name !== FONTS) await caches.delete(name);
      await self.clients.claim();
    })()
  );
});

// The page asks for a refresh of the saved copy each time it opens with signal.
self.addEventListener("message", (event) => {
  if (event.data === "warm") event.waitUntil(warm().catch(() => {}));
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), ms));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/photos/") || url.pathname === "/health" || url.pathname === "/shell.json" || url.pathname === "/sw.js") return;
    // Opening the app: fresh from the server when there is signal, else the saved copy.
    if (req.mode === "navigate") {
      event.respondWith(
        (async () => {
          const cache = await caches.open(SHELL);
          try {
            const res = await Promise.race([fetch(req), timeout(5000)]);
            if (res.ok && url.pathname === "/") cache.put("/", res.clone());
            return res;
          } catch {
            return (await cache.match("/")) || Response.error();
          }
        })()
      );
      return;
    }
    // App files never change once built (their names carry a version), so the saved copy is used first.
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && /^\/(assets|brand)\//.test(url.pathname)) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  // Fonts: saved copy first, refreshed quietly in the background.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(FONTS);
        const hit = await cache.match(req);
        const fresh = fetch(req).then((res) => (res.ok || res.type === "opaque" ? (cache.put(req, res.clone()), res) : res)).catch(() => hit);
        return hit || fresh;
      })()
    );
  }
});
