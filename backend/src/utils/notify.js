// backend/src/utils/notify.js
import mongoose from "mongoose";
import Notification from "../models/Notification.js";

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
 * On internal error the function logs and returns null.
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
    // Basic validation: require recipient, actor, type
    if (!user || !fromUser || !type) {
      // insufficient information — do not create
      console.warn("createNotification: missing user/fromUser/type");
      return null;
    }

    // Avoid notifying the actor about their own action
    if (String(user) === String(fromUser)) return null;

    // Ensure message exists (Notification.message is required)
    if (!message) {
      message = `${String(fromUser)} performed ${type}`;
    }

    const payload = {
      user,
      fromUser, // your Notification model expects `fromUser`
      type,
      targetType: targetType || "none",
      message,
    };

    // Include targetId only if it is a valid ObjectId
    if (targetId && mongoose.isValidObjectId(String(targetId))) {
      // Use 'new' to construct ObjectId to avoid TypeError in some Node/mongoose builds
      payload.targetId = new mongoose.Types.ObjectId(String(targetId));
    } else if (targetId) {
      // If targetId provided but not a valid ObjectId, skip setting targetId
      // and keep the reference only in the message (to avoid schema validation errors)
      payload.message = `${message} (ref:${String(targetId)})`;
    }

    const doc = await Notification.create(payload);
    console.log(
      "createNotification: created",
      doc._id?.toString?.() || "(no id)"
    );
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
