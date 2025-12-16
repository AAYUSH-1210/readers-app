// backend/src/services/cacheWrapper.js
// Hybrid cache wrapper:
// - Uses Redis when REDIS_URL is configured and reachable
// - Falls back to in-memory Map when Redis is unavailable or fails
//
// Notes:
// - In-memory cache is per-process and non-authoritative
// - TTL values are always interpreted as seconds
// - Cache failures must never break application logic

import Redis from "ioredis";

let redis = null;

// Simple in-memory fallback cache (per-process only)
const localCache = new Map();

// Redis is optional; enabled only when REDIS_URL is provided
const useRedis = Boolean(process.env.REDIS_URL);

if (useRedis) {
  redis = new Redis(process.env.REDIS_URL);

  redis.on("error", (e) => {
    console.error("Redis error:", e && e.message ? e.message : e);
  });
}

/**
 * Retrieve a cached value.
 * Returns parsed value or null on miss / error.
 *
 * @param {string} key
 */
export async function cacheGet(key) {
  if (!key) return null;

  // Prefer Redis when available
  if (useRedis && redis) {
    try {
      const v = await redis.get(key);
      if (!v) return null;
      return JSON.parse(v);
    } catch (e) {
      console.error("cacheGet redis failed:", e && e.message ? e.message : e);
      return null;
    }
  }

  // Local in-memory fallback
  const entry = localCache.get(key);
  if (!entry) return null;

  // entry shape: { value, expiresAt }
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    localCache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Store a value in cache.
 * Falls back to local cache if Redis write fails.
 *
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSeconds
 */
export async function cacheSet(key, value, ttlSeconds = 300) {
  if (!key) return;

  // Attempt Redis write first
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
      console.error("cacheSet redis failed:", e && e.message ? e.message : e);
      // fall through to local cache
    }
  }

  // Local fallback cache
  const expiresAt =
    ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;

  localCache.set(key, { value, expiresAt });
}

/**
 * Delete a cached value.
 *
 * @param {string} key
 */
export async function cacheDel(key) {
  if (!key) return;

  if (useRedis && redis) {
    try {
      await redis.del(key);
      return;
    } catch (e) {
      console.error("cacheDel redis failed:", e && e.message ? e.message : e);
    }
  }

  localCache.delete(key);
}

export default {
  cacheGet,
  cacheSet,
  cacheDel,
};
