// backend/src/controllers/notification.controller.js
import Notification from "../models/Notification.js";
import { emitToUser } from "../utils/socketService.js";

/**
 * GET /api/notifications
 */
export async function getMyNotifications(req, res, next) {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("fromUser", "name username avatarUrl");

    const unread = await Notification.countDocuments({
      user: userId,
      seen: false,
    });

    res.json({ notifications, unread });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/:id/seen
 */
export async function markAsSeen(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notif = await Notification.findOne({ _id: id, user: userId });
    if (!notif) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (!notif.seen) {
      notif.seen = true;
      await notif.save();
    }

    const unread = await Notification.countDocuments({
      user: userId,
      seen: false,
    });

    // 🔔 emit realtime unread count
    emitToUser(userId, "notification:unreadCount", { unread });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/mark-all-seen
 */
export async function markAllAsSeen(req, res, next) {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { user: userId, seen: false },
      { seen: true }
    );

    // 🔔 emit realtime unread count = 0
    emitToUser(userId, "notification:unreadCount", { unread: 0 });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
