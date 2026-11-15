// Storage. Three ways to connect, checked in this order:
//   1. REDIS_URL            a normal Redis connection (Railway Redis, or any Redis)
//   2. KV_REST_API_URL/TOKEN Upstash Redis (the one the Huddle Board uses)
//   3. nothing              in memory, laptop testing only
// Every key starts with "field:" so it never touches Huddle or TV data.
import { Redis } from "@upstash/redis";
import IORedis from "ioredis";
import { HOSTED } from "./host.js";

const redisUrl = process.env.REDIS_URL;
const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;
const tcp = redisUrl
  ? globalThis.__fieldRedis || (globalThis.__fieldRedis = new IORedis(redisUrl, { family: 0, maxRetriesPerRequest: 3 }))
  : null;
const rest = !tcp && url && token ? new Redis({ url, token }) : null;
const mem = globalThis.__fieldMem || (globalThis.__fieldMem = { kv: new Map(), hash: new Map() });

function ensure() {
  if (!tcp && !rest && HOSTED) {
    throw new Error("Storage is not connected. Add REDIS_URL (or KV_REST_API_URL and KV_REST_API_TOKEN) to this service.");
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
    if (tcp) return parse(await tcp.get(key));
    if (rest) return parse(await rest.get(key));
    return mem.kv.has(key) ? copy(mem.kv.get(key)) : null;
  },
  async set(key, value, ttlSeconds) {
    ensure();
    const text = JSON.stringify(value);
    if (tcp) {
      if (ttlSeconds) await tcp.set(key, text, "EX", ttlSeconds);
      else await tcp.set(key, text);
      return;
    }
    if (rest) {
      if (ttlSeconds) await rest.set(key, text, { ex: ttlSeconds });
      else await rest.set(key, text);
      return;
    }
    mem.kv.set(key, copy(value));
  },
  async del(key) {
    ensure();
    if (tcp) await tcp.del(key);
    else if (rest) await rest.del(key);
    else mem.kv.delete(key);
  },
  // Whole hash as a plain object of parsed values.
  async hall(key) {
    ensure();
    if (tcp || rest) {
      const raw = (tcp ? await tcp.hgetall(key) : await rest.hgetall(key)) || {};
      const out = {};
      for (const k of Object.keys(raw)) out[k] = parse(raw[k]);
      return out;
    }
    return copy(mem.hash.get(key) || {});
  },
  async hget(key, field) {
    ensure();
    if (tcp) return parse(await tcp.hget(key, field));
    if (rest) return parse(await rest.hget(key, field));
    const h = mem.hash.get(key) || {};
    return field in h ? copy(h[field]) : null;
  },
  async hset(key, field, value) {
    ensure();
    if (tcp) {
      await tcp.hset(key, field, JSON.stringify(value));
      return;
    }
    if (rest) {
      await rest.hset(key, { [field]: JSON.stringify(value) });
      return;
    }
    if (!mem.hash.has(key)) mem.hash.set(key, {});
    mem.hash.get(key)[field] = copy(value);
  },
  async hdel(key, field) {
    ensure();
    if (tcp) await tcp.hdel(key, field);
    else if (rest) await rest.hdel(key, field);
    else if (mem.hash.has(key)) delete mem.hash.get(key)[field];
  },
};
