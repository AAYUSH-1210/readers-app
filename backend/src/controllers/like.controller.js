// backend/src/controllers/like.controller.js
import mongoose from "mongoose";
import Like from "../models/Like.js";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import Note from "../models/Note.js";
import Comment from "../models/Comment.js";
import ShelfItem from "../models/ShelfItem.js";
import User from "../models/User.js";
import { logActivity } from "../utils/activityLogger.js";
import { createNotification } from "../utils/notify.js";
import { emitToUser } from "../utils/socketService.js";

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
 * toggles like for current user; returns { liked: boolean, count: number, likeId? }
 */
export async function toggleLike(req, res, next) {
  try {
    const userId = req.user.id;
    let { targetType, targetId } = req.body;

    if (!targetType || !targetId)
      return res
        .status(400)
        .json({ message: "targetType and targetId required" });

    // ensure targetId is valid ObjectId
    if (!mongoose.isValidObjectId(targetId)) {
      return res
        .status(400)
        .json({ message: "targetId must be a valid ObjectId" });
    }

    const exists = await targetExists(targetType, targetId);
    if (!exists) return res.status(404).json({ message: "Target not found" });

    // Try create; on duplicate remove -> toggle behavior
    try {
      const like = await Like.create({ user: userId, targetType, targetId });

      // increment likesCount on parent (best-effort)
      const modelMap = {
        book: Book,
        review: Review,
        note: Note,
        comment: Comment,
        shelfItem: ShelfItem,
      };
      const TargetModel = modelMap[targetType];
      if (TargetModel) {
        try {
          await TargetModel.findByIdAndUpdate(targetId, {
            $inc: { likesCount: 1 },
          });
        } catch (e) {
          console.error("Failed to increment likesCount", e);
        }
      }

      // activity log (use "like")
      logActivity({
        user: userId,
        type: "like",
        action: "created",
        meta: { targetType, targetId: String(targetId) },
        book: targetType === "book" ? targetId : null,
      });

      // create notification for recipient (best-effort)
      try {
        // resolve recipient by target type
        let recipientId = null;
        if (targetType === "review") {
          const rev = await Review.findById(targetId).select("user");
          recipientId = rev?.user;
        } else if (targetType === "note") {
          const n = await Note.findById(targetId).select("user");
          recipientId = n?.user;
        } else if (targetType === "comment") {
          const c = await Comment.findById(targetId).select("user");
          recipientId = c?.user;
        } else if (targetType === "shelfItem") {
          const si = await ShelfItem.findById(targetId).select("user");
          recipientId = si?.user;
        } else if (targetType === "book") {
          const b = await Book.findById(targetId).select("owner"); // optional owner field
          recipientId = b?.owner;
        }

        // only notify if recipient exists and is not the actor
        if (recipientId && String(recipientId) !== String(userId)) {
          const actor = await User.findById(userId).select(
            "name username avatarUrl"
          );
          const actorName =
            (actor && (actor.name || actor.username)) || "Someone";
          const message = `${actorName} liked your ${targetType}`;

          const not = await createNotification({
            user: recipientId,
            fromUser: userId,
            type: "like",
            targetType,
            targetId,
            message,
          });

          // emit realtime event (best-effort)
          try {
            emitToUser(recipientId, "notification", {
              id: not?._id,
              type: "like",
              actor: {
                _id: actor?._id,
                name: actorName,
                avatarUrl: actor?.avatarUrl,
              },
              targetType,
              targetId,
              message,
              createdAt: not?.createdAt,
            });
          } catch (e) {
            // don't fail the request if emit fails
            console.error("emitToUser failed", e);
          }
        }
      } catch (errNotify) {
        console.error("Failed to create/emit notification", errNotify);
      }

      const count = await Like.countDocuments({ targetType, targetId });
      return res.status(201).json({ liked: true, count, likeId: like._id });
    } catch (err) {
      // duplicate key -> toggle off
      if (err.code === 11000) {
        const removed = await Like.findOneAndDelete({
          user: userId,
          targetType,
          targetId,
        });
        // decrement likesCount on parent (best-effort)
        const modelMap = {
          book: Book,
          review: Review,
          note: Note,
          comment: Comment,
          shelfItem: ShelfItem,
        };
        const TargetModel = modelMap[targetType];
        if (TargetModel) {
          try {
            await TargetModel.findByIdAndUpdate(targetId, {
              $inc: { likesCount: -1 },
            });
          } catch (e) {
            console.error("Failed to decrement likesCount", e);
          }
        }

        // activity log
        logActivity({
          user: userId,
          type: "like",
          action: "removed",
          meta: { targetType, targetId: String(targetId) },
        });

        const count = await Like.countDocuments({ targetType, targetId });
        return res.json({ liked: false, count });
      }

      // if other error, check existing and remove if present
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
          type: "like",
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
