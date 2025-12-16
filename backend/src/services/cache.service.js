// backend/src/services/cache.service.js
// Lightweight Redis cache service.
// Provides simple JSON-based get/set helpers with TTL support.
//
// Design principles:
// - Cache failures should never crash the app
// - TTL is always expressed in seconds
// - Environment configuration is expected to be done at app startup

import Redis from "ioredis";

// Initialize Redis client (single shared instance)
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

// Minimal lifecycle logging for visibility
redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err && err.message ? err.message : err);
});

/**
 * Retrieve a value from cache.
 * Returns parsed JSON or null on miss / error.
 *
 * @param {string} key
 */
export async function cacheGet(key) {
  if (!key) return null;

  try {
    const v = await redis.get(key);
    if (!v) return null;
    return JSON.parse(v);
  } catch {
    // Parsing or Redis failure should not break caller
    return null;
  }
}

/**
 * Store a value in cache.
 * Automatically JSON-serializes non-string values.
 *
 * @param {string} key
 * @param {*} value
 * @param {number} ttlSec - time-to-live in seconds
 */
export async function cacheSet(key, value, ttlSec = 60) {
  if (!key) return;

  try {
    const serialized =
      typeof value === "string" ? value : JSON.stringify(value);

    if (ttlSec && ttlSec > 0) {
      await redis.set(key, serialized, "EX", ttlSec);
    } else {
      await redis.set(key, serialized);
    }
  } catch (e) {
    // Cache write failures are intentionally non-fatal
    console.error("cacheSet error:", e && e.message ? e.message : e);
  }
}

export default redis;
