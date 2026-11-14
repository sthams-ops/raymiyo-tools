// Runs the built app on a laptop for testing, without Vercel.
//   npm run build && FIELD_DEV_LOGIN=1 npm run local
// Then open http://localhost:4173/api/auth?action=dev&email=sajina@unijoynepal.com
// Data lives in memory and disappears when this stops.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const file = path.join(root, "api", url.pathname.slice(5).replace(/[^a-z]/g, "") + ".js");
    if (!fs.existsSync(file)) return res.writeHead(404).end("Not found");
    let body = "";
    for await (const chunk of req) body += chunk;
    wrap(req, res, url, body);
    const mod = await import(pathToFileURL(file).href);
    return mod.default(req, res);
  }
  let file = path.join(dist, path.normalize(url.pathname));
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, "index.html");
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const port = Number(process.env.PORT) || 4173;
server.listen(port, () => console.log(`Raymiyo Field running at http://localhost:${port}`));
