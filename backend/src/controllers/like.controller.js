// backend/src/controllers/like.controller.js
// Like controller.
//
// Responsibilities:
// - Toggle likes on supported target types
// - Maintain denormalized likesCount on targets (best-effort)
// - Emit activity events for feed
// - Create notifications for content owners
// - Emit realtime socket updates (best-effort)
//
// Design notes:
// - Like toggling is implemented via create → duplicate-key → delete pattern
// - All targets must be referenced by ObjectId (no externalId support here)
// - likesCount is denormalized and may drift in rare failure cases
// - Notifications and socket emits are best-effort and never block requests

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

/**
 * Best-effort target existence check.
 *
 * Notes:
 * - Requires valid ObjectId
 * - Does not support externalId
 * - Used only as pre-validation for toggleLike
 */
async function targetExists(targetType, targetId) {
  if (!targetType || !targetId) return false;
  if (!mongoose.isValidObjectId(targetId)) return false;

  if (targetType === "book") {
    return Boolean(await Book.exists({ _id: targetId }));
  }
  if (targetType === "review") {
    return Boolean(await Review.exists({ _id: targetId }));
  }
  if (targetType === "note") {
    return Boolean(await Note.exists({ _id: targetId }));
  }
  if (targetType === "comment") {
    return Boolean(await Comment.exists({ _id: targetId }));
  }
  if (targetType === "shelfItem") {
    return Boolean(await ShelfItem.exists({ _id: targetId }));
  }

  return false;
}

/* ======================================================
   POST /api/likes/toggle
====================================================== */
/**
 * Toggle like for the current user.
 *
 * body:
 * - targetType: "book" | "review" | "note" | "comment" | "shelfItem"
 * - targetId: ObjectId
 *
 * Returns:
 * - { liked: boolean, count: number, likeId? }
 */
export async function toggleLike(req, res, next) {
  try {
    const userId = req.user.id;
    let { targetType, targetId } = req.body;

    if (!targetType || !targetId) {
      return res.status(400).json({
        message: "targetType and targetId required",
      });
    }

    // Enforce ObjectId-only targets
    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({
        message: "targetId must be a valid ObjectId",
      });
    }

    const exists = await targetExists(targetType, targetId);
    if (!exists) {
      return res.status(404).json({ message: "Target not found" });
    }

    // Try creating a like; duplicate key means toggle OFF
    try {
      const like = await Like.create({
        user: userId,
        targetType,
        targetId,
      });

      // Best-effort increment of likesCount
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

      // Activity log
      logActivity({
        user: userId,
        type: "like",
        action: "created",
        meta: { targetType, targetId: String(targetId) },
        book: targetType === "book" ? targetId : null,
      });

      // Best-effort notification to content owner
      try {
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
          // Optional owner field on Book (best-effort)
          const b = await Book.findById(targetId).select("owner");
          recipientId = b?.owner;
        }

        // Notify only if recipient exists and is not the actor
        if (recipientId && String(recipientId) !== String(userId)) {
          const actor = await User.findById(userId).select(
            "name username avatarUrl"
          );

          const actorName =
            (actor && (actor.name || actor.username)) || "Someone";

          const message = `${actorName} liked your ${targetType}`;

          const notification = await createNotification({
            user: recipientId,
            fromUser: userId,
            type: "like",
            targetType,
            targetId,
            message,
          });

          // Emit realtime notification payload (best-effort)
          try {
            emitToUser(recipientId, "notification", {
              id: notification?._id,
              type: "like",
              actor: {
                _id: actor?._id,
                name: actorName,
                avatarUrl: actor?.avatarUrl,
              },
              targetType,
              targetId,
              message,
              createdAt: notification?.createdAt,
            });
          } catch (e) {
            console.error("emitToUser failed", e);
          }
        }
      } catch (notifyErr) {
        console.error("Failed to create or emit like notification", notifyErr);
      }

      const count = await Like.countDocuments({
        targetType,
        targetId,
      });

      return res.status(201).json({
        liked: true,
        count,
        likeId: like._id,
      });
    } catch (err) {
      // Duplicate key → toggle OFF
      if (err.code === 11000) {
        await Like.findOneAndDelete({
          user: userId,
          targetType,
          targetId,
        });

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

        logActivity({
          user: userId,
          type: "like",
          action: "removed",
          meta: { targetType, targetId: String(targetId) },
        });

        const count = await Like.countDocuments({
          targetType,
          targetId,
        });

        return res.json({ liked: false, count });
      }

      // Defensive fallback
      const existing = await Like.findOne({
        user: userId,
        targetType,
        targetId,
      });

      if (existing) {
        await Like.findByIdAndDelete(existing._id);

        logActivity({
          user: userId,
          type: "like",
          action: "removed",
          meta: { targetType, targetId: String(targetId) },
        });

        const count = await Like.countDocuments({
          targetType,
          targetId,
        });

        return res.json({ liked: false, count });
      }

      throw err;
    }
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/likes/count
====================================================== */
/**
 * Get like count for a target.
 */
export async function getLikeCount(req, res, next) {
  try {
    const { targetType, targetId } = req.query;

    if (!targetType || !targetId) {
      return res.status(400).json({
        message: "targetType and targetId required",
      });
    }

    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({
        message: "targetId must be valid ObjectId",
      });
    }

    const count = await Like.countDocuments({
      targetType,
      targetId,
    });

    res.json({ targetType, targetId, count });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/likes/list
====================================================== */
/**
 * List likes for a target (paginated).
 */
export async function listLikes(req, res, next) {
  try {
    const { targetType, targetId } = req.query;

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    if (!targetType || !targetId) {
      return res.status(400).json({
        message: "targetType and targetId required",
      });
    }

    if (!mongoose.isValidObjectId(targetId)) {
      return res.status(400).json({
        message: "targetId must be valid ObjectId",
      });
    }

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

/* ======================================================
   GET /api/likes/me
====================================================== */
/**
 * List targets liked by the current user (paginated).
 */
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
