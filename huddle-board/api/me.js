import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").find((c) => c.trim().startsWith(`${name}=`));
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : null;
}

// Map email to team member id
const EMAIL_TO_ID = {
  "mijesh.shrestha@unijoynepal.com": "admin",
  "sajina@unijoynepal.com": "sajina",
  "divash.shilpakar@unijoynepal.com": "divash",
  "accounts@unijoynepal.com": "manoj",
  "info@unijoynepal.com": "krisha",
  "sunil.shrestha@unijoynepal.com": "sunil",
};

export default async function handler(req, res) {
  const sessionId = getCookie(req, "huddle_session");
  if (!sessionId) return res.json({ user: null });

  const raw = await redis.get(`huddle:session:${sessionId}`);
  if (!raw) return res.json({ user: null });

  const session = typeof raw === "string" ? JSON.parse(raw) : raw;
  return res.json({
    user: {
      ...session,
      memberId: EMAIL_TO_ID[session.email] || null,
    },
  });
}
