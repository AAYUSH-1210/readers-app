// backend/src/controllers/activity.controller.js
// Activity controller.
//
// Responsibilities:
// - Expose read-only activity feeds
// - Support personal, user-specific, and global activity views
//
// Notes:
// - Activity.user represents the owner/target of the activity
// - Activity.actor (if present) represents who performed the action
// - All routes are read-only and side-effect free
// - Pagination is intentionally omitted; hard limits are applied

import Activity from "../models/Activity.js";

/**
 * GET /api/activity/my
 *
 * Returns recent activity items owned by the authenticated user.
 */
export async function getMyActivity(req, res, next) {
  try {
    const userId = req.user.id;

    const items = await Activity.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("book")
      .populate("user", "name username avatarUrl");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/activity/user/:userId
 *
 * Returns recent public activity for a given user.
 *
 * Assumes ObjectId validation is handled upstream.
 */
export async function getActivityForUser(req, res, next) {
  try {
    const userId = req.params.userId;

    const items = await Activity.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("book")
      .populate("user", "name username avatarUrl");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/activity/global
 *
 * Returns recent global activity across all users.
 * Intended for admin dashboards or discovery feeds.
 */
export async function getGlobalActivity(req, res, next) {
  try {
    const items = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("book")
      .populate("user", "name username avatarUrl");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}
