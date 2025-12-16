// backend/src/utils/notify.js
// Utility for creating notifications and emitting realtime updates.
// This function is intentionally non-fatal: failures are logged and
// do not interrupt the primary request flow.

import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { emitToUser } from "./socketService.js";

/**
 * createNotification({
 *   user,
 *   fromUser,
 *   type,
 *   targetType,
 *   targetId,
 *   message,
 * })
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
    // Basic validation — avoid unnecessary DB work
    if (!user || !fromUser || !type) {
      console.warn("createNotification: missing user/fromUser/type");
      return null;
    }

    const userId = String(user);
    const fromUserId = String(fromUser);

    // Avoid notifying a user about their own action
    if (userId === fromUserId) return null;

    const finalMessage = message || `${fromUserId} performed ${type}`;

    const payload = {
      user,
      fromUser,
      type,
      targetType: targetType || "none",
      message: finalMessage,
    };

    // Attach targetId only if it is a valid ObjectId
    if (targetId && mongoose.isValidObjectId(String(targetId))) {
      payload.targetId = new mongoose.Types.ObjectId(String(targetId));
    } else if (targetId) {
      // Preserve reference context for non-ObjectId targets
      payload.message = `${finalMessage} (ref:${String(targetId)})`;
    }

    // Persist notification
    const doc = await Notification.create(payload);

    // 🔔 Emit realtime notification event
    emitToUser(userId, "notification", {
      id: doc._id,
      type: doc.type,
      fromUser: fromUserId,
      targetType: doc.targetType,
      targetId: doc.targetId || null,
      message: doc.message,
      createdAt: doc.createdAt,
    });

    // 🔢 Emit updated unread notification count
    // Recomputed from DB for accuracy
    const unread = await Notification.countDocuments({
      user,
      seen: false,
    });

    emitToUser(userId, "notification:unreadCount", { unread });

    return doc;
  } catch (err) {
    // Notification failures should not break core flows
    console.error(
      "createNotification failed:",
      err && err.stack ? err.stack : err
    );
    return null;
  }
}

export default createNotification;
