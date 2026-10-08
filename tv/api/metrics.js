import { Redis } from "@upstash/redis";
import { nepalToday, monthRanges, buildMetrics } from "../lib/metrics.js";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CACHE_KEY = "tv:metrics";
const FRESH_SECONDS = 120; // reuse a result this young instead of asking Zoho again

// The env var can be the whole REST API URL copied from Zoho (recommended) or just the key.
// When it is the whole URL, the function name in it is used, so the two can never disagree.
function zohoTarget() {
  const raw = (process.env.ZOHO_TV_API_KEY || "").trim();
  let key = raw;
  let origin = "https://www.zohoapis.com";
  let path = "/crm/v7/functions/gettvmetrics/actions/execute";
  if (raw.includes("zapikey=")) {
    try {
      const u = new URL(raw);
      key = u.searchParams.get("zapikey") || raw.split("zapikey=")[1];
      if (/\/functions\/[^/]+\/actions\/execute/.test(u.pathname)) {
        origin = u.origin;
        path = u.pathname;
      }
    } catch (e) {
      key = raw.split("zapikey=")[1];
    }
  }
  const name = (path.match(/\/functions\/([^/]+)\//) || [])[1] || "?";
  return { key: String(key || "").trim(), url: origin + path, name };
}

async function readCache() {
  try {
    const raw = await redis.get(CACHE_KEY);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

async function fetchFromZoho(todayYmd) {
  const target = zohoTarget();
  if (!target.key) throw new Error("ZOHO_TV_API_KEY is not set in Vercel yet.");
  const { months } = monthRanges(todayYmd);
  const q = new URLSearchParams({
    auth_type: "apikey",
    zapikey: target.key,
    d0s: months[0].start,
    d0e: months[0].end,
    d1s: months[1].start,
    d1e: months[1].end,
    d2s: months[2].start,
    d2e: months[2].end,
  });
  const url = `${target.url}?${q.toString()}`;
  const resp = await fetch(url);
  const wrapper = await resp.json();
  if (!wrapper || wrapper.code !== "success") {
    throw new Error("Zoho said: " + JSON.stringify(wrapper).slice(0, 300) + " [function called: " + target.name + "]");
  }
  const out = wrapper.details && wrapper.details.output;
  const data = typeof out === "string" ? JSON.parse(out) : out;
  if (!data || data.error) throw new Error("Zoho function error: " + JSON.stringify(data).slice(0, 300));
  // Never turn a failed CRM query into "0": all four results must be present
  const counts = [data.c0, data.c1, data.c2];
  if (!Array.isArray(data.days) || counts.some((c) => c === null || c === undefined || !Number.isFinite(Number(c)))) {
    throw new Error("CRM returned incomplete data: " + JSON.stringify(data).slice(0, 200));
  }
  return data;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const now = Date.now();
  const cached = await readCache();
  if (cached && cached.savedAt && now - cached.savedAt < FRESH_SECONDS * 1000) {
    return res.status(200).json({ ...cached.payload, stale: false });
  }

  try {
    const todayYmd = nepalToday();
    const raw = await fetchFromZoho(todayYmd);
    const target = Number(process.env.TV_NEW_CUSTOMER_TARGET) || 30;
    const metrics = buildMetrics({
      rows: raw.days || [],
      brows: Array.isArray(raw.bdays) ? raw.bdays : undefined,
      counts: { c0: raw.c0, c1: raw.c1, c2: raw.c2 },
      todayYmd,
      target,
    });
    const payload = { asOf: new Date(now).toISOString(), ...metrics };
    try {
      await redis.set(CACHE_KEY, JSON.stringify({ savedAt: now, payload }));
    } catch (e) {}
    return res.status(200).json({ ...payload, stale: false });
  } catch (err) {
    // Zoho unreachable: show the last good numbers, clearly marked as old
    if (cached && cached.payload) {
      return res.status(200).json({ ...cached.payload, stale: true, note: err.message });
    }
    return res.status(502).json({ error: err.message });
  }
}
