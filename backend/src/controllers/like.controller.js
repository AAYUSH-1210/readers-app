// backend/src/controllers/like.controller.js
import mongoose from "mongoose";
import Like from "../models/Like.js";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import Note from "../models/Note.js";
import Comment from "../models/Comment.js";
import ShelfItem from "../models/ShelfItem.js";
import { logActivity } from "../utils/activityLogger.js";

/* Helper: validate target exists (best-effort) */
async function targetExists(targetType, targetId) {
  if (!targetType || !targetId) return false;
  if (!mongoose.isValidObjectId(targetId)) return false;

  if (targetType === "book")
    return Boolean(await Book.exists({ _id: targetId }));
  if (targetType === "review")
    return Boolean(await Review.exists({ _id: targetId }));
  if (targetType === "note")
    return Boolean(await Note.exists({ _id: targetId }));
  if (targetType === "comment")
    return Boolean(await Comment.exists({ _id: targetId }));
  if (targetType === "shelfItem")
    return Boolean(await ShelfItem.exists({ _id: targetId }));
  return false;
}

/**
 * POST /api/likes/toggle
 * body: { targetType, targetId }
 * toggles like for current user; returns { liked: boolean, count: number }
 */
export async function toggleLike(req, res, next) {
  try {
    const userId = req.user.id;
    let { targetType, targetId } = req.body;

    if (!targetType || !targetId)
      return res
        .status(400)
        .json({ message: "targetType and targetId required" });

    // allow targetId to be string _id; ensure it's ObjectId
    if (!mongoose.isValidObjectId(targetId)) {
      return res
        .status(400)
        .json({ message: "targetId must be a valid ObjectId" });
    }

    const exists = await targetExists(targetType, targetId);
    if (!exists) return res.status(404).json({ message: "Target not found" });

    // try to create like; if duplicate error => remove existing one (toggle)
    try {
      const like = await Like.create({ user: userId, targetType, targetId });
      // success => liked
      // activity
      logActivity({
        user: userId,
        type: "favorite", // reuse "favorite" or add "like" to Activity enum if you prefer
        action: "added",
        meta: { targetType, targetId: String(targetId) },
        book: targetType === "book" ? targetId : null,
      });

      const count = await Like.countDocuments({ targetType, targetId });
      return res.status(201).json({ liked: true, count, likeId: like._id });
    } catch (err) {
      // if duplicate key error -> it already exists; remove it
      if (err.code === 11000) {
        const removed = await Like.findOneAndDelete({
          user: userId,
          targetType,
          targetId,
        });
        const count = await Like.countDocuments({ targetType, targetId });

        // activity: removed
        logActivity({
          user: userId,
          type: "favorite",
          action: "removed",
          meta: { targetType, targetId: String(targetId) },
        });

        return res.json({ liked: false, count });
      }
      // If other error, maybe it exists already; attempt to find and remove
      const existing = await Like.findOne({
        user: userId,
        targetType,
        targetId,
      });
      if (existing) {
        await Like.findByIdAndDelete(existing._id);
        const count = await Like.countDocuments({ targetType, targetId });
        logActivity({
          user: userId,
          type: "favorite",
          action: "removed",
          meta: { targetType, targetId: String(targetId) },
        });
        return res.json({ liked: false, count });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

/* GET /api/likes/count?targetType=&targetId= */
export async function getLikeCount(req, res, next) {
  try {
    const { targetType, targetId } = req.query;
    if (!targetType || !targetId)
      return res
        .status(400)
        .json({ message: "targetType and targetId required" });
    if (!mongoose.isValidObjectId(targetId))
      return res
        .status(400)
        .json({ message: "targetId must be valid ObjectId" });

    const count = await Like.countDocuments({ targetType, targetId });
    res.json({ targetType, targetId, count });
  } catch (err) {
    next(err);
  }
}

/* GET /api/likes/list?targetType=&targetId=&limit=&page= */
export async function listLikes(req, res, next) {
  try {
    const { targetType, targetId } = req.query;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    if (!targetType || !targetId)
      return res
        .status(400)
        .json({ message: "targetType and targetId required" });
    if (!mongoose.isValidObjectId(targetId))
      return res
        .status(400)
        .json({ message: "targetId must be valid ObjectId" });

    const [likes, total] = await Promise.all([
      Like.find({ targetType, targetId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name username avatarUrl"),
      Like.countDocuments({ targetType, targetId }),
    ]);

    res.json({ page, limit, total, likes });
  } catch (err) {
    next(err);
  }
}

/* GET /api/likes/me  -> list targets the user has liked (paginated) */
export async function listMyLikes(req, res, next) {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [likes, total] = await Promise.all([
      Like.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Like.countDocuments({ user: userId }),
    ]);

    res.json({ page, limit, total, likes });
  } catch (err) {
    next(err);
  }
}
