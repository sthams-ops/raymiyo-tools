import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const APP_URL = process.env.HUDDLE_APP_URL;
const REDIRECT_URI = `${APP_URL}/api/auth?action=callback`;

const ALLOWED_EMAILS = [
  "mijesh.shrestha@unijoynepal.com",
  "bivek.maharjan@unijoynepal.com",
  "divash.shilpakar@unijoynepal.com",
  "sajina@unijoynepal.com",
  "accounts@unijoynepal.com",
  "info@unijoynepal.com",
  "sunil.shrestha@unijoynepal.com",
];

const ADMIN_EMAIL = "mijesh.shrestha@unijoynepal.com";

function randomState() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push("SameSite=Lax", "Path=/");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").find((c) => c.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : null;
}

export default async function handler(req, res) {
  const action = req.query.action || "login";

  if (action === "login") {
    const state = randomState();
    await redis.setex(`huddle:oauth:state:${state}`, 300, "valid");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: ZOHO_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: "AaaServer.profile.READ",
      access_type: "online",
      state,
    });
    res.redirect(`https://accounts.zoho.com/oauth/v2/auth?${params}`);
    return;
  }

  if (action === "callback") {
    const { code, state, error } = req.query;
    if (error || !code || !state) {
      res.redirect(`${APP_URL}?error=oauth_failed`);
      return;
    }
    const stateValid = await redis.get(`huddle:oauth:state:${state}`);
    if (!stateValid) {
      res.redirect(`${APP_URL}?error=invalid_state`);
      return;
    }
    await redis.del(`huddle:oauth:state:${state}`);

    const tokenRes = await fetch("https://accounts.zoho.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      res.redirect(`${APP_URL}?error=token_failed`);
      return;
    }

    const profileRes = await fetch("https://accounts.zoho.com/oauth/user/info", {
      headers: { Authorization: `Zoho-oauthtoken ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    const email = (profile.Email || profile.email || profile.Email_ID || "").toLowerCase();
    console.log("Zoho profile response:", JSON.stringify(profile));

    if (!ALLOWED_EMAILS.includes(email)) {
      res.redirect(`${APP_URL}?error=not_allowed`);
      return;
    }

    const sessionId = randomState() + randomState();
    const sessionData = {
      email,
      name: profile.Display_Name || profile.name || email.split("@")[0],
      isAdmin: email === ADMIN_EMAIL,
      createdAt: Date.now(),
    };
    await redis.setex(`huddle:session:${sessionId}`, 60 * 60 * 24 * 7, JSON.stringify(sessionData));

    setCookie(res, "huddle_session", sessionId, { maxAge: 604800, httpOnly: true, secure: true });
    res.redirect(APP_URL);
    return;
  }

  if (action === "logout") {
    const sessionId = getCookie(req, "huddle_session");
    if (sessionId) await redis.del(`huddle:session:${sessionId}`);
    setCookie(res, "huddle_session", "", { maxAge: 0, httpOnly: true, secure: true });
    res.redirect(APP_URL);
    return;
  }

  res.status(400).json({ error: "Unknown action" });
}
