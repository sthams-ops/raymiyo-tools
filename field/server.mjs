// The server that runs Raymiyo Field on Railway (or any host with Node).
//   npm run build && npm start
// It serves the built app, answers the /api/* calls with the same files
// Vercel used to run, shows saved photos at /photos/*, and reports /health.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};
const squeezable = new Set([".html", ".js", ".css", ".svg", ".json", ".webmanifest"]);

// Gives the handlers the small subset of Vercel's request/response helpers they use.
export function wrap(req, res, url, bodyText) {
  req.query = Object.fromEntries(url.searchParams);
  try {
    req.body = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    req.body = bodyText;
  }
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (obj) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };
  res.redirect = (to) => {
    res.statusCode = 302;
    res.setHeader("Location", to);
    res.end();
  };
}

function sendFile(req, res, file, cache) {
  const ext = path.extname(file);
  const headers = { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" };
  const wantsGzip = squeezable.has(ext) && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  if (wantsGzip) {
    headers["Content-Encoding"] = "gzip";
    headers["Vary"] = "Accept-Encoding";
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
  } else {
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  }
}

const inside = (base, file) => file === base || file.startsWith(base + path.sep);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    // Short link for the team: field.raymiyo.com/app always gives the newest Android app file.
    if (url.pathname === "/app") return res.writeHead(302, { Location: "https://github.com/sthams-ops/raymiyo-tools/releases/latest/download/Raymiyo-Field.apk", "Cache-Control": "no-store" }).end();

    if (url.pathname === "/health") return res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");

    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z]/g, "");
      const file = path.join(root, "api", name + ".js");
      if (!name || !fs.existsSync(file)) return res.writeHead(404).end("Not found");
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) return res.writeHead(413).end("Too large");
      }
      wrap(req, res, url, body);
      res.setHeader("Cache-Control", "no-store");
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }

    if (url.pathname.startsWith("/photos/") && process.env.PHOTO_DIR) {
      const base = path.resolve(process.env.PHOTO_DIR);
      const file = path.resolve(base, "." + decodeURIComponent(url.pathname.slice(7)));
      if (!inside(base, file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end("Not found");
      return sendFile(req, res, file, "public, max-age=31536000, immutable");
    }

    let file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
    const real = inside(dist, file) && fs.existsSync(file) && fs.statSync(file).isFile();
    if (!real) file = path.join(dist, "index.html");
    const name = path.basename(file);
    // Built files carry a fingerprint in their name, so they can be kept for a year.
    // The page itself and the service worker must always be fetched fresh.
    const cache = file.includes(path.sep + "assets" + path.sep) ? "public, max-age=31536000, immutable" : name === "sw.js" || name === "index.html" ? "no-cache" : "public, max-age=3600";
    return sendFile(req, res, file, cache);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Something went wrong on the server." }));
  }
});

const port = Number(process.env.PORT) || 4173;
server.listen(port, "0.0.0.0", () => console.log(`Raymiyo Field running on port ${port}`));
