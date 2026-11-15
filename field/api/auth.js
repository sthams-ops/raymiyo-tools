// Sign in with Zoho, the same way the Huddle Board does.
//   /api/auth?action=login     sends the person to Zoho
//   /api/auth?action=callback  Zoho sends them back here
//   /api/auth?action=logout    signs out
// Only people on the Team list with a company email get in.
import { store } from "../lib/store.js";
import { DOMAIN, loadUsers, rid, setCookie, getCookie, fail } from "../lib/auth.js";
import { HOSTED, HTTPS } from "../lib/host.js";

const SESSION_SECONDS = 60 * 60 * 24 * 30;

function appUrl(req) {
  if (process.env.FIELD_APP_URL) return process.env.FIELD_APP_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${HTTPS ? "https" : "http"}://${host}`;
}

async function startSession(res, email) {
  const sid = rid(32);
  await store.set("field:session:" + sid, { email, createdAt: Date.now() }, SESSION_SECONDS);
  setCookie(res, "field_session", sid, SESSION_SECONDS);
}

export default async function handler(req, res) {
  try {
    const action = req.query.action || "login";
    const base = appUrl(req);
    const redirectUri = `${base}/api/auth?action=callback`;

    if (action === "login") {
      if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET) {
        res.redirect(`${base}/?error=not_configured`);
        return;
      }
      const state = rid(16);
      await store.set("field:oauth:" + state, 1, 600);
      const q = new URLSearchParams({
        response_type: "code",
        client_id: process.env.ZOHO_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "AaaServer.profile.READ",
        access_type: "online",
        state,
      });
      res.redirect(`https://accounts.zoho.com/oauth/v2/auth?${q}`);
      return;
    }

    if (action === "callback") {
      const { code, state, error } = req.query;
      if (error || !code || !state) return res.redirect(`${base}/?error=oauth_failed`);
      const known = await store.get("field:oauth:" + state);
      if (!known) return res.redirect(`${base}/?error=expired`);
      await store.del("field:oauth:" + state);

      const tokenRes = await fetch("https://accounts.zoho.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.ZOHO_CLIENT_ID,
          client_secret: process.env.ZOHO_CLIENT_SECRET,
          redirect_uri: redirectUri,
        }),
      });
      const token = await tokenRes.json();
      if (!token.access_token) return res.redirect(`${base}/?error=oauth_failed`);

      const profileRes = await fetch("https://accounts.zoho.com/oauth/user/info", {
        headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` },
      });
      const profile = await profileRes.json();
      const email = String(profile.Email || profile.email || "").toLowerCase();
      const users = await loadUsers();
      const user = users[email];
      if (!email.endsWith("@" + DOMAIN) || !user || user.active === false) {
        return res.redirect(`${base}/?error=not_allowed`);
      }
      await startSession(res, email);
      res.redirect(base + "/");
      return;
    }

    if (action === "logout") {
      const sid = getCookie(req, "field_session");
      if (sid) await store.del("field:session:" + sid);
      setCookie(res, "field_session", "", 0);
      res.redirect(base + "/");
      return;
    }

    // Laptop testing only. Never available when hosted.
    if (action === "dev" && process.env.FIELD_DEV_LOGIN === "1" && !HOSTED) {
      const users = await loadUsers();
      const email = String(req.query.email || "").toLowerCase();
      if (!users[email]) return res.status(404).json({ error: "No such user" });
      await startSession(res, email);
      res.redirect(base + "/");
      return;
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (e) {
    fail(res, e);
  }
}
