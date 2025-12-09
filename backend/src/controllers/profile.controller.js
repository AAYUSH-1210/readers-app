// backend/src/controllers/profile.controller.js
import mongoose from "mongoose";
import User from "../models/User.js";
import bcrypt from "bcrypt";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";
import Follow from "../models/Follow.js";
import Activity from "../models/Activity.js";

/* ========== Update Profile (name, username, bio, avatarUrl) ========== */
export async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, username, bio } = req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;

    // avatar from Cloudinary? (middleware sets req.avatarUrl)
    if (req.avatarUrl) {
      updateData.avatarUrl = req.avatarUrl;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-passwordHash");

    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
}

/* ========== Change Password ========== */
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

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
}

/* ============================
   Helpers for public profile
   ============================ */
function isObjectId(id) {
  return new mongoose.isValidObjectId(id);
}

async function resolveUserByIdentifier(identifier) {
  if (!identifier) return null;
  if (isObjectId(identifier)) {
    return User.findById(identifier).select("-passwordHash").lean();
  } else {
    return User.findOne({ username: identifier })
      .select("-passwordHash")
      .lean();
  }
}

/* ============================
   GET /api/profile/:identifier
   returns public user object + basic stats summary
   ============================ */
export async function getPublicProfile(req, res, next) {
  try {
    const identifier = req.params.userId;
    const user = await resolveUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ message: "User not found" });

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
      Reading.countDocuments({ user: user._id, status: "finished" }),
      Reading.countDocuments({ user: user._id, status: "reading" }),
      Reading.countDocuments({ user: user._id, status: "to-read" }),
    ]);

    // top authors from user's reviews
    // top authors from user's reviews
    const topAuthorsAgg = await Review.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(user._id) } },
      {
        $lookup: {
          from: "books",
          localField: "book",
          foreignField: "_id",
          as: "bookDoc",
        },
      },
      { $unwind: { path: "$bookDoc", preserveNullAndEmptyArrays: true } },
      {
        $unwind: { path: "$bookDoc.authors", preserveNullAndEmptyArrays: true },
      },
      {
        $group: {
          _id: "$bookDoc.authors",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    const topAuthors = topAuthorsAgg
      .filter((a) => a._id)
      .map((a) => ({ author: a._id, count: a.count }));

    // recent books from Reading (most recent updates)
    const recentReadings = await Reading.find({ user: user._id })
      .sort({ updatedAt: -1 })
      .limit(8)
      .populate({
        path: "book",
        select: "title authors cover externalId",
      })
      .lean();

    const recentBooks = recentReadings
      .filter((r) => r.book)
      .map((r) => ({
        bookId: r.book._id,
        externalId: r.book.externalId,
        title: r.book.title,
        authors: r.book.authors,
        cover: r.book.cover,
        status: r.status,
        progress: r.progress,
        updatedAt: r.updatedAt,
      }));

    // recent activity
    const recentActivity = await Activity.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("actor", "name username avatarUrl")
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
        topAuthors,
      },
      recentBooks,
      recentActivity,
    });
  } catch (err) {
    next(err);
  }
}

/* ============================
   GET /api/profile/:identifier/stats
   ============================ */
export async function getPublicProfileStats(req, res, next) {
  try {
    const identifier = req.params.userId;
    const user = await resolveUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ message: "User not found" });

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
      Reading.countDocuments({ user: user._id, status: "finished" }),
      Reading.countDocuments({ user: user._id, status: "reading" }),
      Reading.countDocuments({ user: user._id, status: "to-read" }),
    ]);

    res.json({
      stats: {
        reviewsCount,
        followersCount,
        followingCount,
        shelvesCount,
        booksFinished,
        booksReading,
        booksToRead,
      },
    });
  } catch (err) {
    next(err);
  }
}

/* ============================
   GET /api/profile/:identifier/reviews
   ============================ */
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
        .populate("user", "name username avatarUrl"),
      Review.countDocuments({ user: user._id }),
    ]);

    res.json({ page, limit, total, reviews });
  } catch (err) {
    next(err);
  }
}

/* ============================
   GET /api/profile/:identifier/shelves
   ============================ */
export async function getPublicProfileShelves(req, res, next) {
  try {
    const identifier = req.params.userId;
    const user = await resolveUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ message: "User not found" });

    const shelves = await Shelf.find({ user: user._id })
      .sort({ createdAt: -1 })
      .lean();
    const shelfIds = shelves.map((s) => s._id);

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
      { $unwind: { path: "$bookDoc", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$shelf",
          sample: {
            $push: {
              bookId: "$bookDoc._id",
              title: "$bookDoc.title",
              cover: "$bookDoc.cover",
              externalId: "$bookDoc.externalId",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const itemsMap = {};
    items.forEach((it) => {
      itemsMap[String(it._id)] = {
        sample: (it.sample || []).slice(0, 6),
        count: it.count,
      };
    });

    const enrichedShelves = shelves.map((s) => {
      const im = itemsMap[String(s._id)] || { sample: [], count: 0 };
      return {
        _id: s._id,
        name: s.name,
        description: s.description,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        count: im.count,
        sample: im.sample,
      };
    });

    res.json({ shelves: enrichedShelves });
  } catch (err) {
    next(err);
  }
}
