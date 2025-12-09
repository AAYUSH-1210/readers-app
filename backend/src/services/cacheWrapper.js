// backend/src/services/cacheWrapper.js
import Redis from "ioredis";

let redis = null;
const localCache = new Map();
const useRedis = Boolean(process.env.REDIS_URL);

if (useRedis) {
  redis = new Redis(process.env.REDIS_URL);
  redis.on("error", (e) => {
    console.error("Redis error", e && e.message ? e.message : e);
  });
}

/**
 * cacheGet(key) -> parsed value or null
 */
export async function cacheGet(key) {
  if (!key) return null;
  if (useRedis && redis) {
    try {
      const v = await redis.get(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      console.error("cacheGet redis failed", e && e.message ? e.message : e);
      return null;
    }
  }
  // local fallback
  const entry = localCache.get(key);
  if (!entry) return null;
  // entry: { value, expiresAt }
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    localCache.delete(key);
    return null;
  }
  return entry.value;
}

/**
 * cacheSet(key, value, ttlSeconds)
 */
export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!key) return;
  if (useRedis && redis) {
    try {
      const s = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await redis.set(key, s, "EX", Math.floor(ttlSeconds));
      } else {
        await redis.set(key, s);
      }
      return;
    } catch (e) {
      console.error("cacheSet redis failed", e && e.message ? e.message : e);
      // fallback to local
    }
  }
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  localCache.set(key, { value, expiresAt });
}

/**
 * cacheDel(key)
 */
export async function cacheDel(key) {
  if (!key) return;
  if (useRedis && redis) {
    try {
      await redis.del(key);
      return;
    } catch (e) {
      console.error("cacheDel redis failed", e && e.message ? e.message : e);
    }
  }
  localCache.delete(key);
}

export default { cacheGet, cacheSet, cacheDel };
