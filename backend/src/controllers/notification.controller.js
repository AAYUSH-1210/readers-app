// backend/src/controllers/notification.controller.js
// Notification controller.
//
// Responsibilities:
// - Fetch user notifications
// - Track unread notification count
// - Mark notifications as seen (single or all)
// - Emit real-time unread count updates via Socket.IO
//
// Assumptions:
// - All routes are authenticated
// - ObjectId validation is handled at the routing or global error layer
// - Pagination is intentionally omitted for now

import Notification from "../models/Notification.js";
import { emitToUser } from "../utils/socketService.js";

/**
 * GET /api/notifications
 *
 * Returns all notifications for the authenticated user,
 * ordered by most recent first, along with unread count.
 */
export async function getMyNotifications(req, res, next) {
  try {
    const userId = req.user.id;

    const notifications = await Notification.find({
      user: userId,
    })
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
 *
 * Marks a single notification as seen and emits
 * an updated unread count in real time.
 */
export async function markAsSeen(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notif = await Notification.findOne({
      _id: id,
      user: userId,
    });

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

    // Emit real-time unread count update
    emitToUser(userId, "notification:unreadCount", {
      unread,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/notifications/mark-all-seen
 *
 * Marks all notifications as seen and emits
 * unread count = 0 in real time.
 */
export async function markAllAsSeen(req, res, next) {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { user: userId, seen: false },
      { seen: true }
    );

    // Emit real-time unread count reset
    emitToUser(userId, "notification:unreadCount", {
      unread: 0,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
