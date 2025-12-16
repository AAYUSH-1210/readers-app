// backend/src/controllers/comment.controller.js
// Comment controller.
//
// Responsibilities:
// - Create comments on books, reviews, or notes
// - Support one-level threaded replies
// - Fetch comments by target with pagination
// - Edit and soft-delete comments
// - Maintain denormalized commentsCount on targets (best-effort)
// - Log activity events for social feed
//
// Design notes:
// - Supported target types: "book", "review", "note"
// - Replies are limited to ONE level (no deep nesting by design)
// - Deleting a comment is a SOFT delete (text replaced, thread preserved)
// - commentsCount is denormalized and may drift in rare failure cases

import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import Note from "../models/Note.js";
import { logActivity } from "../utils/activityLogger.js";

/**
 * Best-effort target existence check.
 *
 * Notes:
 * - This is NOT transactional
 * - Used only for validation before creating a comment
 * - Book supports both ObjectId and externalId
 * - Review and Note require valid ObjectId
 */
async function targetExists(targetType, targetId) {
  if (!targetType || !targetId) return false;

  if (targetType === "book") {
    if (mongoose.isValidObjectId(targetId)) {
      return Boolean(await Book.exists({ _id: targetId }));
    }
    return Boolean(await Book.exists({ externalId: targetId }));
  }

  if (targetType === "review") {
    if (mongoose.isValidObjectId(targetId)) {
      return Boolean(await Review.exists({ _id: targetId }));
    }
    return false;
  }

  if (targetType === "note") {
    if (mongoose.isValidObjectId(targetId)) {
      return Boolean(await Note.exists({ _id: targetId }));
    }
    return false;
  }

  return false;
}

/* ======================================================
   POST /api/comments/add
====================================================== */
/**
 * Create a new comment.
 *
 * body:
 * - targetType: "book" | "review" | "note"
 * - targetId: ObjectId or externalId (books only)
 * - text: string
 * - parent: optional parent comment id (reply)
 * - externalId: optional book externalId fallback
 */
export async function addComment(req, res, next) {
  try {
    const userId = req.user.id;
    let { targetType, targetId, text, parent, externalId } = req.body;

    if (!targetType || !targetId || !text) {
      return res.status(400).json({
        message: "targetType, targetId and text required",
      });
    }

    // Resolve book externalId → _id if needed
    if (targetType === "book" && !mongoose.isValidObjectId(targetId)) {
      const book =
        (await Book.findOne({ externalId: targetId })) ||
        (externalId ? await Book.findOne({ externalId }) : null);

      if (book) {
        targetId = book._id;
      }
    }

    // Validate target existence
    const ok = await targetExists(targetType, targetId);
    if (!ok) {
      return res.status(404).json({ message: "Target not found" });
    }

    // Validate parent comment (reply)
    if (parent) {
      const p = await Comment.findById(parent);
      if (!p) {
        return res.status(404).json({ message: "Parent comment not found" });
      }

      // Ensure parent belongs to same target
      if (
        String(p.targetType) !== String(targetType) ||
        String(p.targetId) !== String(targetId)
      ) {
        return res.status(400).json({
          message: "Parent comment target mismatch",
        });
      }
    }

    // Prevent rapid duplicate comments (5-minute window)
    const duplicate = await Comment.findOne({
      user: userId,
      targetType,
      targetId,
      text,
      createdAt: {
        $gt: new Date(Date.now() - 5 * 60 * 1000),
      },
    });

    if (duplicate) {
      return res.status(429).json({
        message:
          "Duplicate comment detected — try editing your previous comment.",
      });
    }

    // Create comment
    const comment = await Comment.create({
      user: userId,
      targetType,
      targetId,
      externalId:
        externalId ||
        (targetType === "book" && mongoose.isValidObjectId(targetId)
          ? (
              await Book.findById(targetId)
            )?.externalId
          : null),
      text,
      parent: parent || null,
    });

    await comment.populate("user", "name username avatarUrl");

    // Best-effort increment of commentsCount
    const modelMap = {
      book: Book,
      review: Review,
      note: Note,
    };
    const TargetModel = modelMap[targetType];

    if (TargetModel && mongoose.isValidObjectId(String(targetId))) {
      try {
        await TargetModel.findByIdAndUpdate(targetId, {
          $inc: { commentsCount: 1 },
        });
      } catch (err) {
        console.error("Failed to increment commentsCount", err);
      }
    }

    // Activity log
    logActivity({
      user: userId,
      type: "comment",
      action: "created",
      meta: {
        targetType,
        targetId: String(comment.targetId),
        commentId: comment._id,
      },
    });

    res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/comments/:targetType/:targetId
====================================================== */
/**
 * Fetch comments for a target.
 *
 * Notes:
 * - Only TOP-LEVEL comments are paginated
 * - Replies are fetched separately (one-level deep)
 * - Deleted comments are excluded
 */
export async function getCommentsByTarget(req, res, next) {
  try {
    let { targetType, targetId } = req.params;

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    // Normalize book externalId → _id
    if (targetType === "book" && !mongoose.isValidObjectId(targetId)) {
      const book = await Book.findOne({
        externalId: targetId,
      });

      if (book) {
        targetId = book._id;
      } else {
        return res.json({
          page,
          limit,
          total: 0,
          comments: [],
        });
      }
    }

    const [comments, total] = await Promise.all([
      Comment.find({
        targetType,
        targetId,
        parent: null,
        deleted: false,
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name username avatarUrl"),
      Comment.countDocuments({
        targetType,
        targetId,
        parent: null,
        deleted: false,
      }),
    ]);

    // Fetch replies (one level)
    const parentIds = comments.map((c) => c._id);
    const replies = parentIds.length
      ? await Comment.find({
          parent: { $in: parentIds },
          deleted: false,
        })
          .sort({ createdAt: 1 })
          .populate("user", "name username avatarUrl")
      : [];

    // Group replies by parent
    const replyMap = {};
    for (const r of replies) {
      const pid = String(r.parent);
      if (!replyMap[pid]) replyMap[pid] = [];
      replyMap[pid].push(r);
    }

    const result = comments.map((c) => ({
      ...c.toObject(),
      replies: replyMap[String(c._id)] || [],
    }));

    res.json({
      page,
      limit,
      total,
      comments: result,
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   PATCH /api/comments/:id
====================================================== */
/**
 * Edit a comment.
 * Only the comment owner may edit.
 */
export async function updateComment(req, res, next) {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const { text } = req.body;

    const comment = await Comment.findById(id);

    if (!comment || comment.deleted) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (String(comment.user) !== String(userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (text !== undefined) {
      comment.text = text;
    }

    comment.editedAt = new Date();
    await comment.save();

    await comment.populate("user", "name username avatarUrl");

    // Activity log
    logActivity({
      user: userId,
      type: "comment",
      action: "updated",
      meta: { commentId: id },
    });

    res.json({ comment });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   DELETE /api/comments/:id
====================================================== */
/**
 * Soft-delete a comment.
 *
 * Behavior:
 * - Marks deleted = true
 * - Replaces text with "[deleted]"
 * - Preserves replies and thread structure
 */
export async function deleteComment(req, res, next) {
  try {
    const userId = req.user.id;
    const id = req.params.id;

    const comment = await Comment.findById(id);

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (String(comment.user) !== String(userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    comment.deleted = true;
    comment.text = "[deleted]";
    await comment.save();

    // Best-effort decrement of commentsCount
    const modelMap = {
      book: Book,
      review: Review,
      note: Note,
    };
    const TargetModel = modelMap[comment.targetType];

    if (TargetModel && mongoose.isValidObjectId(String(comment.targetId))) {
      try {
        await TargetModel.findByIdAndUpdate(comment.targetId, {
          $inc: { commentsCount: -1 },
        });
      } catch (err) {
        console.error("Failed to decrement commentsCount", err);
      }
    }

    // Activity log
    logActivity({
      user: userId,
      type: "comment",
      action: "deleted",
      meta: { commentId: id },
    });

    res.json({ message: "deleted" });
  } catch (err) {
    next(err);
  }
}
