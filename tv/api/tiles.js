import { Redis } from "@upstash/redis";
import crypto from "node:crypto";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// Only this key is ever written by the TV project. The huddle app's keys
// all start with "huddle:" and are never touched here.
const KEY = "tv:tiles";

// CRM metric tiles the TV page knows how to draw
const METRICS = ["sales", "customers", "b2b"];

// Used until the first time someone saves from the admin page.
const DEFAULT_TILES = [
  {
    id: "b2c-sales",
    type: "chart",
    title: "B2C Sales — This Month",
    secs: 20,
    on: true,
    url: "https://crm.zoho.com/crm/specific/ViewChartImage?width=1000&height=500&embedDetails=4f21a008487b89ec72fb7af7053b2b7b947b93e3449bf5626c9b865485db39dce00d3d620382d40c4c3314d75b1d39f1dcae43f9913c2013d943372fccc7e525483c12e804950590b71be62c8884c96d65d30c59cafaf16013a02d28ca70130219129f2f9936d53ebf77ffe87e37652d",
  },
  {
    id: "new-b2c-vs-target",
    type: "chart",
    title: "New B2C Customers vs Target",
    secs: 20,
    on: true,
    url: "https://crm.zoho.com/crm/specific/ViewChartImage?width=1000&height=500&embedDetails=121253a543b831b67c1ec55db952fec577b7afae95adc3f4a231444b36830a78ae4c8a5205c58cbc5746a8d4c1aa21e81660843d77f3663f4295fe20febfe3d333bf8ef53edd181a68d033be3417c7534c2a9030dcab160f2c6992b82d2f575b6f663ad18fbffd27842743c7de3e4d9d",
  },
  {
    id: "huddle-tasks",
    type: "tasks",
    title: "This Week's Huddle",
    secs: 30,
    on: true,
  },
];

function passwordOk(given) {
  const real = process.env.ADMIN_PASSWORD || "";
  if (!real) return false;
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

function clean(tiles) {
  if (!Array.isArray(tiles) || tiles.length > 30) {
    throw new Error("Invalid tile list");
  }
  return tiles.map((t, i) => {
    const type = t && t.type === "tasks" ? "tasks" : t && t.type === "metric" ? "metric" : "chart";
    const title = String((t && t.title) || "").trim().slice(0, 80);
    const secs = Math.min(300, Math.max(5, Math.round(Number(t && t.secs) || 20)));
    const on = !(t && t.on === false);
    const id = String((t && t.id) || `${Date.now()}-${i}`).slice(0, 40);
    const out = { id, type, title, secs, on };
    if (type === "metric") {
      const metric = String((t && t.metric) || "");
      if (!METRICS.includes(metric)) {
        throw new Error(`Tile ${i + 1} ("${title || "no title"}"): unknown CRM metric`);
      }
      out.metric = metric;
    }
    if (type === "chart") {
      const url = String((t && t.url) || "").trim();
      if (!/^https:\/\//i.test(url) || url.length > 2000) {
        throw new Error(`Tile ${i + 1} ("${title || "no title"}"): the URL must start with https://`);
      }
      out.url = url;
    }
    return out;
  });
}

async function readTiles() {
  const raw = await redis.get(KEY);
  if (!raw) return null;
  const val = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(val) ? val : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const saved = await readTiles();
      return res.status(200).json({ tiles: saved || DEFAULT_TILES, isDefault: !saved });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const body = req.body || {};

    if (!process.env.ADMIN_PASSWORD) {
      return res.status(500).json({ error: "ADMIN_PASSWORD is not set in Vercel yet." });
    }
    if (!passwordOk(body.password)) {
      await new Promise((r) => setTimeout(r, 600)); // slow down guessing
      return res.status(401).json({ error: "Wrong password" });
    }

    if (body.action === "login") {
      return res.status(200).json({ ok: true });
    }

    try {
      const tiles = clean(body.tiles);
      await redis.set(KEY, JSON.stringify(tiles));
      return res.status(200).json({ ok: true, tiles });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
