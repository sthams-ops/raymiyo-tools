// Who is signed in and what they may do.
// People sign in with Zoho (their company email). The list of people and their
// roles lives in storage and is managed by the admin inside the app (Team tab).
import crypto from "node:crypto";
import { store } from "./store.js";
import { COLORS } from "../shared/rules.js";
import { HTTPS } from "./host.js";

export const DOMAIN = (process.env.FIELD_DOMAIN || "unijoynepal.com").toLowerCase();
// The owner can never be removed or downgraded, so the app cannot lock everyone out.
export const OWNER = (process.env.FIELD_OWNER_EMAIL || "mijesh.shrestha@unijoynepal.com").toLowerCase();

const SEED = [
  { email: OWNER, name: "Mijesh Shrestha", role: "admin" },
  { email: "bivek.maharjan@unijoynepal.com", name: "Bivek Maharjan", role: "viewer" },
  { email: "divash.shilpakar@unijoynepal.com", name: "Divash Shilpakar", role: "rep" },
  { email: "sajina@unijoynepal.com", name: "Sajina Magar", role: "rep" },
].map((u, i) => ({ ...u, color: COLORS[(i + 2) % COLORS.length], active: true }));

export const rid = (bytes = 16) => crypto.randomBytes(bytes).toString("hex");

export async function loadUsers() {
  let users = await store.hall("field:users");
  if (!Object.keys(users).length) {
    for (const u of SEED) await store.hset("field:users", u.email, u);
    users = Object.fromEntries(SEED.map((u) => [u.email, u]));
  }
  const owner = users[OWNER];
  if (!owner || owner.role !== "admin" || owner.active === false) {
    users[OWNER] = { ...(owner || SEED[0]), email: OWNER, role: "admin", active: true };
    await store.hset("field:users", OWNER, users[OWNER]);
  }
  return users;
}

export function getCookie(req, name) {
  const found = (req.headers.cookie || "").split(";").find((c) => c.trim().startsWith(name + "="));
  return found ? decodeURIComponent(found.trim().slice(name.length + 1)) : null;
}

export function setCookie(res, name, value, maxAgeSeconds) {
  const secure = HTTPS ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax; Path=/${secure}`);
}

// The signed-in person, read fresh each time so role changes apply at once.
export async function currentUser(req) {
  const sid = getCookie(req, "field_session");
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return null;
  const session = await store.get("field:session:" + sid);
  if (!session) return null;
  const users = await loadUsers();
  const user = users[session.email];
  return user && user.active !== false ? user : null;
}

// Use at the top of every API file. Returns the user, or answers 401/403 and returns null.
export async function guard(req, res, roles) {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ error: "Please sign in again." });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    res.status(403).json({ error: "Your account is not allowed to do this." });
    return null;
  }
  return user;
}

export function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

export const clean = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

export function fail(res, err) {
  console.error(err);
  res.status(500).json({ error: err && err.message ? err.message : "Something went wrong. Try again." });
}
