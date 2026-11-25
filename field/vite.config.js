import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import fs from "node:fs";
import path from "node:path";

// After each build, list the files the phone must keep to open the app with
// no signal. The service worker (public/sw.js) reads this list.
function shellList() {
  return {
    name: "shell-list",
    closeBundle() {
      const dist = path.resolve("dist");
      if (!fs.existsSync(dist)) return;
      const heavy = /jspdf|html2canvas|purify|autotable/i; // PDF export: office use, needs signal
      const files = fs.readdirSync(path.join(dist, "assets")).filter((f) => !heavy.test(f)).map((f) => "/assets/" + f);
      files.push("/sounds/raymiyo-soft.mp3", "/brand/raymiyo-mark.png", "/brand/raymiyo-logo.png", "/icon-192.png", "/manifest.webmanifest");
      fs.writeFileSync(path.join(dist, "shell.json"), JSON.stringify({ built: Date.now(), files }));
    },
  };
}

export default defineConfig({
  // legacy: a second copy of the app for older built-in browsers, such as the one
  // inside the OptiSigns app on the office TV box. Modern phones keep the fast copy.
  plugins: [react(), legacy({ targets: ["chrome >= 49", "android >= 5", "safari >= 11"], modernPolyfills: true }), shellList()],
  // cssTarget: older browsers also get layout rules they understand (inset -> top/left...).
  build: { chunkSizeWarningLimit: 1600, cssTarget: ["chrome61", "safari11"] },
});
