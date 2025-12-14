// backend/src/utils/notify.js
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { emitToUser } from "./socketService.js";

/**
 * createNotification({
 *   user,        // recipient user id (required)
 *   fromUser,    // actor user id (required)
 *   type,        // "like" | "reply" | "follow" etc. (required)
 *   targetType,  // "review" | "note" | "comment" | "book" | null
 *   targetId,    // ObjectId or string (optional)
 *   message,     // human-friendly short message (required)
 * })
 *
 * Returns the created Notification document OR null if not created.
 * Emits a realtime "notification" socket event to the recipient (best-effort).
 */
export async function createNotification({
  user,
  fromUser,
  type,
  targetType = "none",
  targetId = null,
  message = null,
}) {
  try {
    if (!user || !fromUser || !type) {
      console.warn("createNotification: missing user/fromUser/type");
      return null;
    }

    // Avoid notifying the actor about their own action
    if (String(user) === String(fromUser)) return null;

    // Ensure message exists
    if (!message) {
      message = `${String(fromUser)} performed ${type}`;
    }

    const payload = {
      user,
      fromUser,
      type,
      targetType: targetType || "none",
      message,
    };

    // Include targetId only if it is a valid ObjectId
    if (targetId && mongoose.isValidObjectId(String(targetId))) {
      payload.targetId = new mongoose.Types.ObjectId(String(targetId));
    } else if (targetId) {
      payload.message = `${message} (ref:${String(targetId)})`;
    }

    const doc = await Notification.create(payload);
    console.log(
      "createNotification: created",
      doc._id?.toString?.() || "(no id)"
    );

    // Best-effort: emit realtime notification to recipient
    try {
      // Build client-friendly payload
      const emitPayload = {
        id: doc._id,
        type: doc.type,
        fromUser: String(fromUser),
        targetType: doc.targetType,
        targetId: doc.targetId || null,
        message: doc.message,
        createdAt: doc.createdAt,
      };
      const emitted = emitToUser(String(user), "notification", emitPayload);
      if (!emitted) {
        // optional: log that the user had no sockets connected right now
        // console.debug("createNotification: emitToUser returned false (user offline?)", user);
      }
    } catch (emitErr) {
      console.error(
        "createNotification: realtime emit failed",
        emitErr && emitErr.message ? emitErr.message : emitErr
      );
    }

    return doc;
  } catch (err) {
    console.error(
      "createNotification failed:",
      err && err.stack ? err.stack : err
    );
    return null;
  }
}

export default createNotification;
