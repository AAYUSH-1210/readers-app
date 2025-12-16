// backend/src/utils/activityLogger.js
// Utility for logging user activities and emitting realtime feed updates.
// This function is intentionally non-blocking for the main request flow:
// database write is primary, realtime emission is best-effort.

import Activity from "../models/Activity.js";
import Follow from "../models/Follow.js";
import { getIo } from "./socket.js";

/**
 * logActivity(payload)
 * payload shape:
 * {
 *   user: ObjectId (required),
 *   actor: ObjectId (optional, defaults to user),
 *   type: String (required),
 *   action: String (required),
 *   book: ObjectId (optional),
 *   meta: Object (optional),
 *   message: String (optional)
 * }
 */
export async function logActivity(payload = {}) {
  try {
    // Basic sanity check — avoid noisy DB errors on malformed calls
    if (!payload.user || !payload.type || !payload.action) {
      console.warn("logActivity skipped due to missing required fields");
      return null;
    }

    const actor = payload.actor || payload.user;
    const meta = payload.meta || {};
    const message = payload.message || null;

    // Persist activity to database
    const doc = await Activity.create({
      user: payload.user,
      actor,
      type: payload.type,
      action: payload.action,
      book: payload.book || null,
      meta,
      message,
    });

    // Emit realtime updates to followers (best-effort, non-blocking)
    try {
      const io = getIo();
      if (io && actor) {
        // Find followers of the actor
        const rows = await Follow.find({ following: actor })
          .select("follower")
          .lean();

        for (const r of rows) {
          const room = `user:${String(r.follower)}`;

          // Emit lightweight feed update; frontend can fetch full details if needed
          io.to(room).emit("feed:update", {
            type: payload.type,
            action: payload.action,
            actor,
            book: payload.book,
            meta,
            message,
            createdAt: doc.createdAt,
          });
        }
      }
    } catch (e) {
      // Realtime failures should never break the main operation
      console.error(
        "logActivity realtime emit failed:",
        e && e.message ? e.message : e
      );
    }

    return doc;
  } catch (err) {
    // Activity logging failure should not crash calling flows
    console.error(
      "Activity log failed:",
      err && err.message ? err.message : err
    );
    return null;
  }
}

export default logActivity;
