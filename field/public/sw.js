// Lets phones install Raymiyo Field as a home-screen app.
// It deliberately stores nothing: every screen and every check-in always
// comes fresh from the server, so nobody sees old data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
