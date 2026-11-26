// Live tracking for the Android app.
//   POST { action: "token" }        signed-in person gets a tracking key for their phone
//   POST { points: [{ lat, lng, accuracy, t }] }   with header  Authorization: Bearer KEY
// The key lets the phone keep sending while the app is in the background, when
// the normal sign-in cookie is not available to it.
import { guard, loadUsers, readBody, fail } from "../lib/auth.js";
import { issueToken, emailForToken, addPoints } from "../lib/track.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const b = readBody(req);

    if (b.action === "token") {
      const me = await guard(req, res, ["rep", "admin"]);
      if (!me) return;
      return res.json({ token: await issueToken(me.email) });
    }

    const header = String((req.headers && req.headers.authorization) || "");
    let email = null;
    if (header.startsWith("Bearer ")) {
      email = await emailForToken(header.slice(7).trim());
      if (!email) return res.status(401).json({ error: "This tracking key is not valid any more." });
      const user = (await loadUsers())[email];
      if (!user || user.active === false || !["rep", "admin"].includes(user.role)) return res.status(401).json({ error: "This person can no longer use the app." });
    } else {
      const me = await guard(req, res, ["rep", "admin"]);
      if (!me) return;
      email = me.email;
    }
    res.json(await addPoints(email, b.points));
  } catch (e) {
    fail(res, e);
  }
}
