// backend/src/controllers/notification.controller.js
import Notification from "../models/Notification.js";

export async function getMyNotifications(req, res, next) {
  try {
    const userId = req.user.id;
    const list = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("fromUser", "name username avatarUrl");

    res.json({ notifications: list });
  } catch (err) {
    next(err);
  }
}

export async function markAsSeen(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const notif = await Notification.findOne({ _id: id, user: userId });
    if (!notif)
      return res.status(404).json({ message: "Notification not found" });

    notif.seen = true;
    await notif.save();

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function markAllAsSeen(req, res, next) {
  try {
    const userId = req.user.id;
    await Notification.updateMany(
      { user: userId, seen: false },
      { seen: true }
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
