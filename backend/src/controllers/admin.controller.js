// backend/src/controllers/admin.controller.js
// Admin controller.
//
// Responsibilities:
// - Admin-only user management (list, ban/unban)
// - Review moderation (soft delete / restore)
// - Administrative analytics & growth metrics
//
// Assumptions:
// - Access control is enforced by adminOnly middleware at the routing layer
// - ObjectId validation is handled upstream or by global error middleware
// - These endpoints are intended for admin dashboards and internal tools

import User from "../models/User.js";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js";
import Book from "../models/Book.js";

/* ======================================================
   USERS
====================================================== */

/**
 * GET /api/admin/users
 *
 * Returns paginated list of users.
 * Password hashes are explicitly excluded.
 */
export async function listUsers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select("-passwordHash")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(),
    ]);

    res.json({ page, limit, total, users });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/users/:userId/ban
 *
 * Ban or unban a user.
 * - banned: true  -> ban user
 * - banned: false -> unban user
 */
export async function banUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { banned } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isBanned: Boolean(banned) },
      { new: true }
    ).select("username isBanned");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   REVIEWS (MODERATION)
====================================================== */

/**
 * GET /api/admin/reviews
 *
 * Query params:
 * - deleted=true|false (optional)
 *
 * Returns paginated list of reviews for moderation.
 */
export async function listReviews(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.deleted === "true") filter.isDeleted = true;
    if (req.query.deleted === "false") filter.isDeleted = false;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("user", "username")
        .populate("book", "title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    res.json({ page, limit, total, reviews });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/reviews/:reviewId/delete
 *
 * Soft-deletes a review.
 */
export async function softDeleteReview(req, res, next) {
  try {
    const { reviewId } = req.params;

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { isDeleted: true },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json({ review });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/admin/reviews/:reviewId/restore
 *
 * Restores a previously soft-deleted review.
 */
export async function restoreReview(req, res, next) {
  try {
    const { reviewId } = req.params;

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { isDeleted: false },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    res.json({ review });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   ADMIN ANALYTICS
====================================================== */

/**
 * GET /api/admin/overview
 *
 * Returns high-level system metrics.
 *
 * Notes:
 * - "activeUsers" is defined as users updated in the last 30 days
 * - updatedAt may change due to profile edits, reading updates, follows, etc.
 */
export async function getAdminOverview(req, res, next) {
  try {
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      totalBooks,
      totalReviews,
      totalReadings,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ updatedAt: { $gte: last30Days } }),
      User.countDocuments({ isBanned: true }),
      Book.countDocuments(),
      Review.countDocuments({ isDeleted: false }),
      Reading.countDocuments(),
    ]);

    res.json({
      totalUsers,
      activeUsers,
      bannedUsers,
      totalBooks,
      totalReviews,
      totalReadings,
      generatedAt: new Date(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/growth
 *
 * Query params:
 * - days (7–90, default 30)
 *
 * Returns per-day growth metrics.
 *
 * Output shape:
 * [{ _id: "YYYY-MM-DD", count }]
 *
 * Note:
 * - Dates are sparse; frontend should fill missing days if needed.
 */
export async function getAdminGrowth(req, res, next) {
  try {
    const days = Math.min(
      90,
      Math.max(7, parseInt(req.query.days || "30", 10))
    );

    const from = new Date();
    from.setDate(from.getDate() - days);

    const [users, reviews, readings] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: from } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Review.aggregate([
        {
          $match: {
            createdAt: { $gte: from },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
      Reading.aggregate([
        { $match: { createdAt: { $gte: from } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
              },
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({ users, reviews, readings });
  } catch (err) {
    next(err);
  }
}
