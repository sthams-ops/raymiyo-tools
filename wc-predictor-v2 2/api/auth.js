// api/auth.js
// Zoho OAuth login, callback, logout + session check

import { Redis } from "@upstash/redis";
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const APP_URL            = process.env.APP_URL || "https://wc.raymiyo.com";
const REDIRECT_URI       = `${APP_URL}/api/auth?action=callback`;
const SESSION_TTL        = 60 * 60 * 24 * 7; // 7 days in seconds

// Whitelist — only these emails can log in
const ALLOWED_EMAILS = [
  "mijesh.shrestha@unijoynepal.com",
  "bivek.maharjan@unijoynepal.com",
  "sajina@unijoynepal.com",
  "divash.shilpakar@unijoynepal.com",
  "info@unijoynepal.com",
  "sunil.shrestha@unijoynepal.com",
  "accounts@unijoynepal.com",
];

// Admin email
const ADMIN_EMAIL = "mijesh.shrestha@unijoynepal.com";

// Email → player profile map
const EMAIL_TO_PLAYER = {
  "mijesh.shrestha@unijoynepal.com":  { id: "mijesh",  name: "Mijesh",  emoji: "👑", color: "#F5C518", role: "Executive Director" },
  "bivek.maharjan@unijoynepal.com":   { id: "bivek",   name: "Bivek",   emoji: "⚡", color: "#06B6D4", role: "Managing Director"  },
  "sajina@unijoynepal.com":           { id: "sajina",  name: "Sajina",  emoji: "🎯", color: "#EC4899", role: "CRM Officer"         },
  "divash.shilpakar@unijoynepal.com": { id: "divash",  name: "Divash",  emoji: "🔥", color: "#4ADE80", role: "CRM Officer"         },
  "info@unijoynepal.com":             { id: "krisha",  name: "Krisha",  emoji: "✨", color: "#A78BFA", role: "Content Creator"     },
  "sunil.shrestha@unijoynepal.com":   { id: "sunil",   name: "Sunil",   emoji: "💪", color: "#F97316", role: "Warehouse Manager"   },
  "accounts@unijoynepal.com":         { id: "manoj",   name: "Manoj",   emoji: "📊", color: "#22D3EE", role: "Accounts"            },
};

function setCookieHeader(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").find(c => c.trim().startsWith(name + "="));
  return match ? match.trim().split("=").slice(1).join("=") : null;
}

function generateSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", APP_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  const { action } = req.query;

  // ── GET /api/auth?action=login ── redirect to Zoho
  if (action === "login") {
    const state = generateSessionId();
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` +
      `response_type=code` +
      `&client_id=${ZOHO_CLIENT_ID}` +
      `&scope=AaaServer.profile.Read` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&access_type=online` +
      `&state=${state}`;
    res.setHeader("Set-Cookie", setCookieHeader("oauth_state", state, 600));
    return res.redirect(302, authUrl);
  }

  // ── GET /api/auth?action=callback ── Zoho redirects here
  if (action === "callback") {
    const { code, state } = req.query;
    const savedState = getCookie(req, "oauth_state");

    if (!code) return res.redirect(302, "/?error=no_code");
    if (state !== savedState) return res.redirect(302, "/?error=state_mismatch");

    // Exchange code for token
    const tokenRes = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokenText = await tokenRes.text();
    let tokenData = {};
    try { tokenData = JSON.parse(tokenText); } catch(e) {
      console.error("Token parse error:", tokenText.substring(0, 200));
      return res.redirect(302, "/?error=token_failed");
    }
    console.log("Token response keys:", Object.keys(tokenData));
    if (!tokenData.access_token) {
      console.error("No access token:", JSON.stringify(tokenData));
      return res.redirect(302, "/?error=token_failed");
    }

    // Get user profile from Zoho
    const profileRes = await fetch("https://accounts.zoho.com/oauth/v2/userin", {
      headers: { 
        Authorization: `Zoho-oauthtoken ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });
    
    const profileText = await profileRes.text();
    let profile = {};
    try { profile = JSON.parse(profileText); } catch(e) {
      console.error("Profile parse error:", profileText.substring(0, 200));
      return res.redirect(302, "/?error=profile_failed");
    }
    
    // Zoho returns email in different fields depending on account type
    const email = (
      profile.Email || profile.email || 
      profile.ZOID || profile.zaaid || ""
    ).toLowerCase().trim();

    // Check whitelist
    if (!ALLOWED_EMAILS.includes(email)) {
      return res.redirect(302, "/?error=not_allowed");
    }

    // Create session
    const sessionId = generateSessionId();
    const player = EMAIL_TO_PLAYER[email];
    const sessionData = {
      email,
      player,
      isAdmin: email === ADMIN_EMAIL,
      createdAt: new Date().toISOString(),
    };

    await kv.set(`session:${sessionId}`, JSON.stringify(sessionData), { ex: SESSION_TTL });

    // Set session cookie + clear state cookie
    res.setHeader("Set-Cookie", [
      setCookieHeader("session_id", sessionId, SESSION_TTL),
      setCookieHeader("oauth_state", "", 0),
    ]);
    return res.redirect(302, "/");
  }

  // ── GET /api/auth?action=me ── return current user
  if (action === "me") {
    res.setHeader("Content-Type", "application/json");
    const sessionId = getCookie(req, "session_id");
    if (!sessionId) return res.status(401).json({ error: "Not logged in" });

    const raw = await kv.get(`session:${sessionId}`);
    if (!raw) return res.status(401).json({ error: "Session expired" });

    const session = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res.status(200).json({ user: session });
  }

  // ── GET /api/auth?action=logout ──
  if (action === "logout") {
    const sessionId = getCookie(req, "session_id");
    if (sessionId) await kv.del(`session:${sessionId}`);
    res.setHeader("Set-Cookie", setCookieHeader("session_id", "", 0));
    return res.redirect(302, "/");
  }

  return res.status(404).json({ error: "Unknown action" });
}
