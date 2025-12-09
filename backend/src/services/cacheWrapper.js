// backend/src/services/cacheWrapper.js
import { cacheGet, cacheSet, default as redis } from "./cache.service.js";

// small helpers with typed exports used by feed.service
export async function cacheGetKey(key) {
  return cacheGet(key);
}
export async function cacheSetKey(key, value, ttlSec = 60) {
  return cacheSet(key, value, ttlSec);
}

// convenience wrappers for the file above (nicer names used in feed.service)
export { cacheGet, cacheSet };
export default redis;
