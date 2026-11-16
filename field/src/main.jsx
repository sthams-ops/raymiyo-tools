import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);

// A real app does not zoom when two fingers pinch the screen or on a double tap.
// iPhones ignore the "no zoom" setting in the page header, so it is also stopped here.
// The map keeps its own pinch-to-zoom.
for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 && !(e.target.closest && e.target.closest(".map"))) e.preventDefault(); }, { passive: false });

// Keeps a copy of the app on the phone so it opens with no signal. See public/sw.js.
if ("serviceWorker" in navigator && (window.location.protocol === "https:" || window.location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((reg) => reg.active && reg.active.postMessage("warm")).catch(() => {});
  });
}
