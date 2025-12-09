// backend/src/services/cache.service.js
import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();

const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

// simple JSON get/set helpers with TTL (seconds)
export async function cacheGet(key) {
  if (!key) return null;
  const v = await redis.get(key);
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttlSec = 60) {
  if (!key) return;
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (ttlSec && ttlSec > 0) {
      await redis.set(key, s, "EX", ttlSec);
    } else {
      await redis.set(key, s);
    }
  } catch (e) {
    console.error("cacheSet error", e && e.message ? e.message : e);
  }
}

export default redis;
