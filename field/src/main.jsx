import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<App />);

// Keeps a copy of the app on the phone so it opens with no signal. See public/sw.js.
if ("serviceWorker" in navigator && (window.location.protocol === "https:" || window.location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then((reg) => reg.active && reg.active.postMessage("warm")).catch(() => {});
  });
}
