// api/predictions.js
// Stores and retrieves predictions using Vercel KV (free tier)
// Falls back to a simple JSON file approach if KV not set up

// Players config — edit here to add/remove players
const PLAYERS = [
  { id: "mijesh",  name: "Mijesh",  role: "Executive Director", emoji: "👑", color: "#F5C518" },
  { id: "bivek",   name: "Bivek",   role: "Managing Director",  emoji: "⚡", color: "#06B6D4" },
  { id: "sajina",  name: "Sajina",  role: "CRM Officer",        emoji: "🎯", color: "#EC4899" },
  { id: "divash",  name: "Divash",  role: "CRM Officer",        emoji: "🔥", color: "#4ADE80" },
  { id: "krisha",  name: "Krisha",  role: "Content Creator",    emoji: "✨", color: "#A78BFA" },
  { id: "sunil",   name: "Sunil",   role: "Warehouse Manager",  emoji: "💪", color: "#F97316" },
];

// In-memory store (persists per serverless instance — not across cold starts)
// For production persistence, swap this out for Vercel KV
if (!global._predictions) global._predictions = {};
if (!global._adminPin) global._adminPin = process.env.ADMIN_PIN || "1234";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action } = req.query;

  // ── GET players list ──
  if (req.method === "GET" && action === "players") {
    return res.status(200).json({ players: PLAYERS });
  }

  // ── GET all predictions ──
  if (req.method === "GET" && action === "get") {
    return res.status(200).json({ predictions: global._predictions });
  }

  // ── GET leaderboard ──
  if (req.method === "GET" && action === "leaderboard") {
    const scores = PLAYERS.map((p) => {
      const preds = global._predictions[p.id] || {};
      let total = 0, correct = 0, exact = 0;
      Object.values(preds).forEach((pred) => {
        if (pred.points !== undefined) {
          total += pred.points;
          if (pred.points >= 1) correct++;
          if (pred.points === 3) exact++;
        }
      });
      return { ...p, total, correct, exact };
    });
    scores.sort((a, b) => b.total - a.total || b.correct - a.correct);
    return res.status(200).json({ leaderboard: scores });
  }

  // ── POST submit prediction ──
  if (req.method === "POST" && action === "predict") {
    const { playerId, matchId, prediction, homeScore, awayScore } = req.body;
    if (!playerId || !matchId || !prediction) {
      return res.status(400).json({ error: "Missing fields" });
    }
    // Check player exists
    const player = PLAYERS.find((p) => p.id === playerId);
    if (!player) return res.status(400).json({ error: "Unknown player" });

    if (!global._predictions[playerId]) global._predictions[playerId] = {};
    global._predictions[playerId][matchId] = {
      prediction,        // "HOME" | "AWAY" | "DRAW"
      homeScore: homeScore !== undefined ? parseInt(homeScore) : null,
      awayScore: awayScore !== undefined ? parseInt(awayScore) : null,
      submittedAt: new Date().toISOString(),
      points: undefined, // will be set when admin scores
    };
    return res.status(200).json({ success: true });
  }

  // ── POST score results (admin only) ──
  if (req.method === "POST" && action === "score") {
    const { pin, matchId, homeGoals, awayGoals, winner } = req.body;
    if (pin !== global._adminPin) {
      return res.status(403).json({ error: "Invalid PIN" });
    }

    // Score all players' predictions for this match
    PLAYERS.forEach((p) => {
      const pred = global._predictions[p.id]?.[matchId];
      if (!pred) return;

      let points = 0;
      const correctWinner =
        (winner === "HOME_TEAM" && pred.prediction === "HOME") ||
        (winner === "AWAY_TEAM" && pred.prediction === "AWAY") ||
        (winner === "DRAW" && pred.prediction === "DRAW");

      if (correctWinner) {
        points = 1; // got winner right
        // Check exact score
        if (
          pred.homeScore !== null &&
          pred.awayScore !== null &&
          pred.homeScore === homeGoals &&
          pred.awayScore === awayGoals
        ) {
          points = 3; // exact score!
        }
      }
      global._predictions[p.id][matchId].points = points;
      global._predictions[p.id][matchId].result = { homeGoals, awayGoals, winner };
    });

    return res.status(200).json({ success: true, matchId, homeGoals, awayGoals });
  }

  return res.status(404).json({ error: "Unknown action" });
}
