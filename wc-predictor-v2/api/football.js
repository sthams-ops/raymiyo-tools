// api/football.js
// Vercel serverless function — proxies football-data.org so API key stays secret

const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "";
const BASE_URL = "https://api.football-data.org/v4";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { endpoint } = req.query;
  if (!endpoint) return res.status(400).json({ error: "Missing endpoint param" });

  // Only allow WC endpoints — security guard
  const allowed = [
    "competitions/WC/matches",
    "competitions/WC/standings",
    "competitions/WC/teams",
    "competitions/WC",
  ];
  const isAllowed = allowed.some((a) => endpoint.startsWith(a));
  if (!isAllowed) return res.status(403).json({ error: "Endpoint not allowed" });

  try {
    // Build full URL — pass any extra query params (e.g. ?stage=GROUP_STAGE)
    const queryParams = { ...req.query };
    delete queryParams.endpoint;
    const qs = new URLSearchParams(queryParams).toString();
    const url = `${BASE_URL}/${endpoint}${qs ? "?" + qs : ""}`;

    const response = await fetch(url, {
      headers: {
        "X-Auth-Token": FOOTBALL_API_KEY,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || "API error" });
    }

    // Cache for 60 seconds on CDN — reduces API calls
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Football API proxy error:", err);
    return res.status(500).json({ error: "Proxy error: " + err.message });
  }
}
