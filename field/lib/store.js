// Storage. On Vercel this is the same Upstash Redis the Huddle Board uses
// (KV_REST_API_URL / KV_REST_API_TOKEN). Every key starts with "field:" so it
// never touches Huddle or TV data. On a laptop with no keys it keeps data in
// memory so the app can be tried out.
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
const mem = globalThis.__fieldMem || (globalThis.__fieldMem = { kv: new Map(), hash: new Map() });

function ensure() {
  if (!redis && process.env.VERCEL) {
    throw new Error("Storage is not connected. Add KV_REST_API_URL and KV_REST_API_TOKEN to this Vercel project.");
  }
}
function parse(v) {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
const copy = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

export const store = {
  async get(key) {
    ensure();
    if (redis) return parse(await redis.get(key));
    return mem.kv.has(key) ? copy(mem.kv.get(key)) : null;
  },
  async set(key, value, ttlSeconds) {
    ensure();
    if (redis) {
      if (ttlSeconds) await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
      else await redis.set(key, JSON.stringify(value));
      return;
    }
    mem.kv.set(key, copy(value));
  },
  async del(key) {
    ensure();
    if (redis) await redis.del(key);
    else mem.kv.delete(key);
  },
  // Whole hash as a plain object of parsed values.
  async hall(key) {
    ensure();
    if (redis) {
      const raw = (await redis.hgetall(key)) || {};
      const out = {};
      for (const k of Object.keys(raw)) out[k] = parse(raw[k]);
      return out;
    }
    return copy(mem.hash.get(key) || {});
  },
  async hget(key, field) {
    ensure();
    if (redis) return parse(await redis.hget(key, field));
    const h = mem.hash.get(key) || {};
    return field in h ? copy(h[field]) : null;
  },
  async hset(key, field, value) {
    ensure();
    if (redis) {
      await redis.hset(key, { [field]: JSON.stringify(value) });
      return;
    }
    if (!mem.hash.has(key)) mem.hash.set(key, {});
    mem.hash.get(key)[field] = copy(value);
  },
  async hdel(key, field) {
    ensure();
    if (redis) await redis.hdel(key, field);
    else if (mem.hash.has(key)) delete mem.hash.get(key)[field];
  },
};
