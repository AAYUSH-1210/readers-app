// backend/src/utils/activityLogger.js
import Activity from "../models/Activity.js";
import Follow from "../models/Follow.js";
import { getIo } from "./socket.js";

/**
 * logActivity(payload)
 * payload: { user, actor (optional), type, action, book, meta, message }
 */
export async function logActivity(payload = {}) {
  try {
    const doc = await Activity.create({
      user: payload.user,
      actor: payload.actor || payload.user,
      type: payload.type,
      action: payload.action,
      book: payload.book || null,
      meta: payload.meta || {},
      message: payload.message || null,
    });

    // Emit to followers of the actor for realtime feed updates
    try {
      const io = getIo();
      if (io && payload.actor) {
        // find followers of actor
        const rows = await Follow.find({ following: payload.actor })
          .select("follower")
          .lean();
        for (const r of rows) {
          const room = `user:${String(r.follower)}`;
          // send lightweight feed item — frontend can decide fetch detail if needed
          io.to(room).emit("feed:update", {
            type: payload.type,
            action: payload.action,
            actor: payload.actor,
            book: payload.book,
            meta: payload.meta || {},
            message: payload.message || null,
            createdAt: doc.createdAt,
          });
        }
      }
    } catch (e) {
      console.error(
        "logActivity realtime emit failed:",
        e && e.message ? e.message : e
      );
    }

    return doc;
  } catch (err) {
    console.error(
      "Activity log failed:",
      err && err.message ? err.message : err
    );
    return null;
  }
}

export default logActivity;
