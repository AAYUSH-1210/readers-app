// backend/src/controllers/profile.controller.js
// Profile controller.
//
// Responsibilities:
// - Handle private profile updates (name, username, bio, avatar, password)
// - Expose public profile data by username or userId
// - Aggregate profile statistics, shelves, reviews, and recent activity
//
// Assumptions:
// - Username uniqueness is enforced at the schema or validation layer
// - Password strength validation is handled by route validators or frontend
// - Authentication middleware populates req.user.id

import mongoose from "mongoose";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";
import Follow from "../models/Follow.js";
import Activity from "../models/Activity.js";

/* ======================================================
   PRIVATE PROFILE ACTIONS
====================================================== */

/**
 * Update authenticated user's profile.
 * Supports name, username, bio, and avatar updates.
 */
export async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, username, bio } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;

    // Avatar upload handled by middleware (uploadAvatar)
    if (req.avatarUrl) updateData.avatarUrl = req.avatarUrl;

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-passwordHash");

    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
}

/**
 * Change authenticated user's password.
 *
 * Validation notes:
 * - Old password verification is enforced here
 * - Password strength validation is assumed upstream
 */
export async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(oldPassword, user.passwordHash);

    if (!match) {
      return res.status(400).json({ message: "Old password incorrect" });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({
      message: "Password updated successfully",
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   HELPER UTILITIES
====================================================== */

/**
 * Safe ObjectId check.
 */
function isObjectId(id) {
  return mongoose.isValidObjectId(id);
}

/**
 * Resolve a user by ObjectId or username.
 * - Password hash is always excluded
 * - Lean documents are returned for read-only use
 */
async function resolveUserByIdentifier(identifier) {
  if (!identifier) return null;

  if (isObjectId(identifier)) {
    return User.findById(identifier).select("-passwordHash").lean();
  }

  return User.findOne({ username: identifier }).select("-passwordHash").lean();
}

/* ======================================================
   PUBLIC PROFILE ENDPOINTS
====================================================== */

/**
 * GET public profile overview.
 * Includes stats, recent books, and recent activity.
 */
export async function getPublicProfile(req, res, next) {
  try {
    const identifier = req.params.userId;
    const user = await resolveUserByIdentifier(identifier);

    if (!user) return res.status(404).json({ message: "User not found" });

    // Aggregate profile statistics in parallel
    const [
      reviewsCount,
      followersCount,
      followingCount,
      shelvesCount,
      booksFinished,
      booksReading,
      booksToRead,
    ] = await Promise.all([
      Review.countDocuments({ user: user._id }),
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      Shelf.countDocuments({ user: user._id }),
      Reading.countDocuments({
        user: user._id,
        status: "finished",
      }),
      Reading.countDocuments({
        user: user._id,
        status: "reading",
      }),
      Reading.countDocuments({
        user: user._id,
        status: "to-read",
      }),
    ]);

    // Recently interacted books (small fixed window)
    const recentBooks = await Reading.find({
      user: user._id,
    })
      .sort({ updatedAt: -1 })
      .limit(8)
      .populate("book", "title authors cover externalId")
      .lean();

    // Recent public activity (reviews, shelves, etc.)
    const recentActivity = await Activity.find({
      actor: user._id,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      user,
      stats: {
        reviewsCount,
        followersCount,
        followingCount,
        shelvesCount,
        booksFinished,
        booksReading,
        booksToRead,
      },
      recentBooks,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET public profile statistics only.
 * Lightweight variant for quick profile cards.
 */
export async function getPublicProfileStats(req, res, next) {
  try {
    const user = await resolveUserByIdentifier(req.params.userId);

    if (!user) return res.status(404).json({ message: "User not found" });

    const stats = await Promise.all([
      Review.countDocuments({ user: user._id }),
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      Shelf.countDocuments({ user: user._id }),
    ]);

    res.json({
      stats: {
        reviewsCount: stats[0],
        followersCount: stats[1],
        followingCount: stats[2],
        shelvesCount: stats[3],
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   PUBLIC PROFILE — REVIEWS
====================================================== */

/**
 * GET paginated public reviews for a profile.
 */
export async function getPublicProfileReviews(req, res, next) {
  try {
    const identifier = req.params.userId;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const user = await resolveUserByIdentifier(identifier);

    if (!user) return res.status(404).json({ message: "User not found" });

    const [reviews, total] = await Promise.all([
      Review.find({ user: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("book", "title authors cover externalId")
        .populate("user", "name username avatarUrl")
        .lean(),
      Review.countDocuments({ user: user._id }),
    ]);

    res.json({ page, limit, total, reviews });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   PUBLIC PROFILE — SHELVES
====================================================== */

/**
 * GET public shelves with item counts and preview books.
 */
export async function getPublicProfileShelves(req, res, next) {
  try {
    const identifier = req.params.userId;
    const user = await resolveUserByIdentifier(identifier);

    if (!user) return res.status(404).json({ message: "User not found" });

    const shelves = await Shelf.find({
      user: user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    const shelfIds = shelves.map((s) => s._id);

    // Aggregate shelf item counts and preview books
    const items = await ShelfItem.aggregate([
      { $match: { shelf: { $in: shelfIds } } },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      {
        $unwind: {
          path: "$bookDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$shelf",
          count: { $sum: 1 },
          sample: {
            $push: {
              bookId: "$bookDoc._id",
              title: "$bookDoc.title",
              cover: "$bookDoc.cover",
              externalId: "$bookDoc.externalId",
            },
          },
        },
      },
    ]);

    const map = {};
    items.forEach((i) => {
      map[String(i._id)] = {
        count: i.count,
        sample: i.sample.slice(0, 6),
      };
    });

    const result = shelves.map((s) => ({
      _id: s._id,
      name: s.name,
      description: s.description,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      count: map[String(s._id)]?.count || 0,
      sample: map[String(s._id)]?.sample || [],
    }));

    res.json({ shelves: result });
  } catch (err) {
    next(err);
  }
}
