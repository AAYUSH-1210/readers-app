// backend/src/utils/notify.js
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
    if (!user || !fromUser || !type) {
      console.warn("createNotification: missing user/fromUser/type");
      return null;
    }

    // Avoid notifying the actor about their own action
    if (String(user) === String(fromUser)) return null;

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

    if (targetId && mongoose.isValidObjectId(String(targetId))) {
      payload.targetId = new mongoose.Types.ObjectId(String(targetId));
    } else if (targetId) {
      payload.message = `${message} (ref:${String(targetId)})`;
    }

    const doc = await Notification.create(payload);

    // 🔔 Emit notification event
    emitToUser(String(user), "notification", {
      id: doc._id,
      type: doc.type,
      fromUser: String(fromUser),
      targetType: doc.targetType,
      targetId: doc.targetId || null,
      message: doc.message,
      createdAt: doc.createdAt,
    });

    // 🔢 Emit realtime unread count
    const unread = await Notification.countDocuments({
      user,
      seen: false,
    });

    emitToUser(String(user), "notification:unreadCount", { unread });

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
