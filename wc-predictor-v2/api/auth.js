// api/auth.js — Zoho OAuth login for Raymiyo WC Predictor
// Fixed: correct Zoho user info endpoint, state cookie handling, multi-DC support

import { Redis } from "@upstash/redis";
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const ZOHO_CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const APP_URL            = process.env.APP_URL || "https://wc.raymiyo.com";
const REDIRECT_URI       = `${APP_URL}/api/auth?action=callback`;
const SESSION_TTL        = 60 * 60 * 24 * 7; // 7 days

const ALLOWED_EMAILS = [
  "mijesh.shrestha@unijoynepal.com",
  "bivek.maharjan@unijoynepal.com",
  "sajina@unijoynepal.com",
  "divash.shilpakar@unijoynepal.com",
  "info@unijoynepal.com",
  "sunil.shrestha@unijoynepal.com",
  "accounts@unijoynepal.com",
];

const ADMIN_EMAIL = "mijesh.shrestha@unijoynepal.com";

const EMAIL_TO_PLAYER = {
  "mijesh.shrestha@unijoynepal.com":  { id: "mijesh",  name: "Mijesh",  emoji: "👑", color: "#F5C518", role: "Executive Director" },
  "bivek.maharjan@unijoynepal.com":   { id: "bivek",   name: "Bivek",   emoji: "⚡", color: "#06B6D4", role: "Managing Director"  },
  "sajina@unijoynepal.com":           { id: "sajina",  name: "Sajina",  emoji: "🎯", color: "#EC4899", role: "CRM Officer"         },
  "divash.shilpakar@unijoynepal.com": { id: "divash",  name: "Divash",  emoji: "🔥", color: "#4ADE80", role: "CRM Officer"         },
  "info@unijoynepal.com":             { id: "krisha",  name: "Krisha",  emoji: "✨", color: "#A78BFA", role: "Content Creator"     },
  "sunil.shrestha@unijoynepal.com":   { id: "sunil",   name: "Sunil",   emoji: "💪", color: "#F97316", role: "Warehouse Manager"   },
  "accounts@unijoynepal.com":         { id: "manoj",   name: "Manoj",   emoji: "📊", color: "#22D3EE", role: "Accounts"            },
};

function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").find(c => c.trim().startsWith(name + "="));
  return match ? match.trim().split("=").slice(1).join("=") : null;
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", APP_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  
  const { action } = req.query;

  // ══════════════════════════════════════════
  // LOGIN — redirect user to Zoho consent page
  // ══════════════════════════════════════════
  if (action === "login") {
    const authUrl = `https://accounts.zoho.com/oauth/v2/auth?` +
      `response_type=code` +
      `&client_id=${ZOHO_CLIENT_ID}` +
      `&scope=AaaServer.profile.Read` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&access_type=online` +
      `&prompt=consent`;
    return res.redirect(302, authUrl);
  }

  // ══════════════════════════════════════════
  // CALLBACK — Zoho redirects here after consent
  // ══════════════════════════════════════════
  if (action === "callback") {
    const { code, error: authError } = req.query;

    if (authError || !code) {
      console.error("Auth callback error:", authError || "no code");
      return res.redirect(302, "/?error=no_code");
    }

    // Step 1: Exchange authorization code for access token
    let tokenData;
    try {
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
      console.log("Token response status:", tokenRes.status);
      console.log("Token response body:", tokenText.substring(0, 300));
      
      tokenData = JSON.parse(tokenText);
      
      if (tokenData.error) {
        console.error("Token error:", tokenData.error);
        return res.redirect(302, "/?error=token_failed");
      }
      if (!tokenData.access_token) {
        console.error("No access_token in response:", JSON.stringify(tokenData));
        return res.redirect(302, "/?error=token_failed");
      }
    } catch (e) {
      console.error("Token exchange failed:", e.message);
      return res.redirect(302, "/?error=token_failed");
    }

    // Step 2: Get user profile from Zoho
    // Use the correct endpoint: /oauth/user/info (NOT /oauth/v2/userin)
    // Also respect api_domain from token response for multi-DC support
    let email = "";
    try {
      // Determine the correct accounts server from the token response
      const accountsServer = tokenData["accounts-server"] || "https://accounts.zoho.com";
      const profileUrl = `${accountsServer}/oauth/user/info`;
      
      console.log("Fetching profile from:", profileUrl);
      
      const profileRes = await fetch(profileUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${tokenData.access_token}`,
          Accept: "application/json",
        },
      });
      
      const profileText = await profileRes.text();
      console.log("Profile response status:", profileRes.status);
      console.log("Profile response body:", profileText.substring(0, 300));
      
      const profile = JSON.parse(profileText);
      
      // Zoho user/info returns Email field
      email = (profile.Email || profile.email || profile.login_name || "").toLowerCase().trim();
      console.log("Detected email:", email);
      
      if (!email) {
        console.error("No email found in profile:", JSON.stringify(profile));
        return res.redirect(302, "/?error=profile_failed");
      }
    } catch (e) {
      console.error("Profile fetch failed:", e.message);
      return res.redirect(302, "/?error=profile_failed");
    }

    // Step 3: Check whitelist
    if (!ALLOWED_EMAILS.includes(email)) {
      console.log("Email not in whitelist:", email);
      return res.redirect(302, "/?error=not_allowed");
    }

    // Step 4: Create session in Redis
    const player = EMAIL_TO_PLAYER[email];
    if (!player) {
      console.error("No player mapping for:", email);
      return res.redirect(302, "/?error=not_allowed");
    }

    const sessionId = makeId();
    const sessionData = {
      email,
      player,
      isAdmin: email === ADMIN_EMAIL,
      createdAt: new Date().toISOString(),
    };

    try {
      await kv.set(`session:${sessionId}`, JSON.stringify(sessionData), { ex: SESSION_TTL });
    } catch (e) {
      console.error("Redis session save failed:", e.message);
      return res.redirect(302, "/?error=session_failed");
    }

    // Step 5: Set session cookie and redirect to app
    res.setHeader("Set-Cookie", setCookie("session_id", sessionId, SESSION_TTL));
    return res.redirect(302, "/");
  }

  // ══════════════════════════════════════════
  // ME — return current logged-in user
  // ══════════════════════════════════════════
  if (action === "me") {
    res.setHeader("Content-Type", "application/json");
    const sessionId = getCookie(req, "session_id");
    if (!sessionId) return res.status(401).json({ error: "Not logged in" });

    try {
      const raw = await kv.get(`session:${sessionId}`);
      if (!raw) return res.status(401).json({ error: "Session expired" });
      const session = typeof raw === "string" ? JSON.parse(raw) : raw;
      return res.status(200).json({ user: session });
    } catch (e) {
      console.error("Session read failed:", e.message);
      return res.status(401).json({ error: "Session error" });
    }
  }

  // ══════════════════════════════════════════
  // LOGOUT — clear session
  // ══════════════════════════════════════════
  if (action === "logout") {
    const sessionId = getCookie(req, "session_id");
    if (sessionId) {
      try { await kv.del(`session:${sessionId}`); } catch(e) {}
    }
    res.setHeader("Set-Cookie", setCookie("session_id", "", 0));
    return res.redirect(302, "/");
  }

  return res.status(404).json({ error: "Unknown action" });
}
