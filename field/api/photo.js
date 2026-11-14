// Stores a shelf photo and answers with its link.
// Works once a Vercel Blob store is connected to this project (that adds
// BLOB_READ_WRITE_TOKEN). Until then the app simply saves check-ins without photos.
//   POST { dataUrl: "data:image/jpeg;base64,..." }   (already shrunk on the phone)
import { guard, readBody, fail, rid } from "../lib/auth.js";
import { nepal } from "../lib/time.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const me = await guard(req, res, ["rep", "admin"]);
    if (!me) return;
    if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(501).json({ error: "Photo storage is not connected yet." });

    const { dataUrl } = readBody(req);
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
    if (!m) return res.status(400).json({ error: "That photo could not be read. Try taking it again." });
    const bytes = Buffer.from(m[1], "base64");
    if (bytes.length > 600 * 1024) return res.status(400).json({ error: "That photo is too large." });

    const { put } = await import("@vercel/blob");
    const { date } = nepal();
    const blob = await put(`field/${date}/${rid(8)}.jpg`, bytes, { access: "public", contentType: "image/jpeg" });
    res.json({ url: blob.url });
  } catch (e) {
    fail(res, e);
  }
}
