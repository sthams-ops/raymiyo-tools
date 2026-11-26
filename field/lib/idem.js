// Phones re-send a saved check-in until the server answers. Each one carries a
// clientId, and the first answer is kept, so a re-send never saves twice.
import { store } from "./store.js";

const KEY = "field:idem";
const clip = (v) => String(v || "").replace(/[^\w-]/g, "").slice(0, 60);

// Answers from memory when this clientId was already handled. Otherwise it
// remembers the answer the handler is about to give. Returns true if answered.
export async function replay(req, res, body, who) {
  const id = clip(body && body.clientId);
  if (!id) return false;
  const field = who + ":" + id;
  const seen = await store.hget(KEY, field);
  if (seen) {
    res.json(seen.data);
    return true;
  }
  const json = res.json.bind(res);
  let code = 200;
  const status = res.status.bind(res);
  res.status = (c) => ((code = c), status(c));
  res.json = (data) => {
    if (code < 300) store.hset(KEY, field, { data, at: Date.now() }).then(prune).catch(() => {});
    return json(data);
  };
  return false;
}

// Old answers are dropped now and then so the list stays small.
let lastPrune = 0;
async function prune() {
  if (Date.now() - lastPrune < 6 * 3600000) return;
  lastPrune = Date.now();
  const all = await store.hall(KEY);
  for (const [field, v] of Object.entries(all)) if (!v || Date.now() - v.at > 14 * 86400000) await store.hdel(KEY, field);
}
