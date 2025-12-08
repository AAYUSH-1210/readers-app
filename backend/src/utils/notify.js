// backend/src/utils/notify.js
import Notification from "../models/Notification.js";

export async function createNotification({
  user, // who receives notification
  fromUser, // actor
  type, // follow, like, reply
  targetType = "none",
  targetId = null,
  message,
}) {
  if (!user || !fromUser || !type || !message) return;

  // Do not notify user about their own action
  if (String(user) === String(fromUser)) return;

  return Notification.create({
    user,
    fromUser,
    type,
    targetType,
    targetId,
    message,
  });
}
