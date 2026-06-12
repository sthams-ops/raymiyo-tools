// api/predictions.js
// All prediction logic — uses Vercel KV for permanent storage
// Predictions are LOCKED on first submit — no edits allowed

import { Redis } from "@upstash/redis";
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const APP_URL     = process.env.APP_URL || "https://wc.raymiyo.com";
const ADMIN_EMAIL = "mijesh.shrestha@unijoynepal.com";

const PLAYERS = [
  { id: "mijesh",  name: "Mijesh",  emoji: "👑", color: "#F5C518", role: "Executive Director" },
  { id: "bivek",   name: "Bivek",   emoji: "⚡", color: "#06B6D4", role: "Managing Director"  },
  { id: "sajina",  name: "Sajina",  emoji: "🎯", color: "#EC4899", role: "CRM Officer"         },
  { id: "divash",  name: "Divash",  emoji: "🔥", color: "#4ADE80", role: "CRM Officer"         },
  { id: "krisha",  name: "Krisha",  emoji: "✨", color: "#A78BFA", role: "Content Creator"     },
  { id: "sunil",   name: "Sunil",   emoji: "💪", color: "#F97316", role: "Warehouse Manager"   },
  { id: "manoj",   name: "Manoj",   emoji: "📊", color: "#22D3EE", role: "Accounts"            },
];

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").find(c => c.trim().startsWith(name + "="));
  return match ? match.trim().split("=").slice(1).join("=") : null;
}

async function getSession(req) {
  const sessionId = getCookie(req, "session_id");
  if (!sessionId) return null;
  const raw = await kv.get(`session:${sessionId}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", APP_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;

  // ── GET players list — public ──
  if (req.method === "GET" && action === "players") {
    return res.status(200).json({ players: PLAYERS });
  }

  // ── GET leaderboard — public ──
  if (req.method === "GET" && action === "leaderboard") {
    const scores = await Promise.all(PLAYERS.map(async (p) => {
      const raw = await kv.get(`predictions:${p.id}`);
      const preds = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
      let total = 0, correct = 0, exact = 0, pending = 0;
      Object.values(preds).forEach((pred) => {
        if (pred.points === undefined || pred.points === null) { pending++; return; }
        total += pred.points;
        if (pred.points >= 1) correct++;
        if (pred.points === 3) exact++;
      });
      return { ...p, total, correct, exact, pending, predictions: Object.keys(preds).length };
    }));
    scores.sort((a, b) => b.total - a.total || b.correct - a.correct);
    return res.status(200).json({ leaderboard: scores });
  }

  // ── GET my predictions — requires login ──
  if (req.method === "GET" && action === "my-predictions") {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Not logged in" });
    const raw = await kv.get(`predictions:${session.player.id}`);
    const preds = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    return res.status(200).json({ predictions: preds });
  }

  // ── GET all predictions — for results display ──
  if (req.method === "GET" && action === "all-predictions") {
    const all = {};
    await Promise.all(PLAYERS.map(async (p) => {
      const raw = await kv.get(`predictions:${p.id}`);
      all[p.id] = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
    }));
    return res.status(200).json({ predictions: all });
  }

  // ── POST submit prediction — requires login, LOCKED on first submit ──
  if (req.method === "POST" && action === "predict") {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Not logged in" });

    const { matchId, prediction, homeScore, awayScore, kickoffTime } = req.body;
    if (!matchId || !prediction) return res.status(400).json({ error: "Missing fields" });

    // Check if prediction already exists — if so, LOCKED
    const raw = await kv.get(`predictions:${session.player.id}`);
    const preds = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};

    if (preds[matchId]) {
      return res.status(403).json({ error: "Prediction already locked. No changes allowed." });
    }

    // Check kickoff hasn't passed
    if (kickoffTime) {
      const kickoff = new Date(kickoffTime);
      const now = new Date();
      if (now >= kickoff) {
        return res.status(403).json({ error: "Match has started. Predictions closed." });
      }
    }

    // Save prediction — locked forever
    preds[matchId] = {
      prediction,
      homeScore: homeScore !== undefined ? parseInt(homeScore) : null,
      awayScore: awayScore !== undefined ? parseInt(awayScore) : null,
      submittedAt: new Date().toISOString(),
      submittedBy: session.email,
      points: null, // set when admin scores
      locked: true,
    };

    await kv.set(`predictions:${session.player.id}`, JSON.stringify(preds));
    return res.status(200).json({ success: true, locked: true, submittedAt: preds[matchId].submittedAt });
  }

  // ── POST score match — admin only ──
  if (req.method === "POST" && action === "score") {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: "Not logged in" });
    if (!session.isAdmin) return res.status(403).json({ error: "Admin only" });

    const { matchId, homeGoals, awayGoals, winner } = req.body;
    if (!matchId || homeGoals === undefined || awayGoals === undefined || !winner) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // Score all players
    let summary = [];
    await Promise.all(PLAYERS.map(async (p) => {
      const raw = await kv.get(`predictions:${p.id}`);
      const preds = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
      const pred = preds[matchId];
      if (!pred) { summary.push({ player: p.name, points: 0, reason: "no prediction" }); return; }

      let points = 0;
      const correctWinner =
        (winner === "HOME_TEAM" && pred.prediction === "HOME") ||
        (winner === "AWAY_TEAM" && pred.prediction === "AWAY") ||
        (winner === "DRAW"      && pred.prediction === "DRAW");

      if (correctWinner) {
        points = 1;
        if (pred.homeScore !== null && pred.awayScore !== null &&
            pred.homeScore === parseInt(homeGoals) && pred.awayScore === parseInt(awayGoals)) {
          points = 3; // exact score
        }
      }

      preds[matchId].points  = points;
      preds[matchId].result  = { homeGoals: parseInt(homeGoals), awayGoals: parseInt(awayGoals), winner };
      preds[matchId].scoredAt = new Date().toISOString();
      await kv.set(`predictions:${p.id}`, JSON.stringify(preds));
      summary.push({ player: p.name, points, prediction: pred.prediction });
    }));

    // Store match result for reference
    await kv.set(`result:${matchId}`, JSON.stringify({ homeGoals, awayGoals, winner, scoredAt: new Date().toISOString() }));

    return res.status(200).json({ success: true, matchId, summary });
  }

  return res.status(404).json({ error: "Unknown action" });
}
