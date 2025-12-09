// backend/src/controllers/comment.controller.js
import mongoose from "mongoose";
import Comment from "../models/Comment.js";
import User from "../models/User.js";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import Note from "../models/Note.js";
import { logActivity } from "../utils/activityLogger.js";

/* Helper: validate target exists (best-effort) */
async function targetExists(targetType, targetId) {
  if (!targetType || !targetId) return false;

  if (targetType === "book") {
    if (mongoose.isValidObjectId(targetId)) {
      return Boolean(await Book.exists({ _id: targetId }));
    } else {
      return Boolean(await Book.exists({ externalId: targetId }));
    }
  }
  if (targetType === "review") {
    if (mongoose.isValidObjectId(targetId))
      return Boolean(await Review.exists({ _id: targetId }));
    return false;
  }
  if (targetType === "note") {
    if (mongoose.isValidObjectId(targetId))
      return Boolean(await Note.exists({ _id: targetId }));
    return false;
  }
  return false;
}

/* POST /api/comments/add
   body: { targetType, targetId, text, parent (optional), externalId (optional for books) }
*/
export async function addComment(req, res, next) {
  try {
    const userId = req.user.id;
    let { targetType, targetId, text, parent, externalId } = req.body;

    if (!targetType || !targetId || !text)
      return res
        .status(400)
        .json({ message: "targetType, targetId and text required" });

    // Resolve book externalId -> _id if necessary
    if (targetType === "book" && !mongoose.isValidObjectId(targetId)) {
      const b =
        (await Book.findOne({ externalId: targetId })) ||
        (externalId ? await Book.findOne({ externalId }) : null);
      if (b) targetId = b._id;
    }

    // validate target exists
    const ok = await targetExists(targetType, targetId);
    if (!ok) return res.status(404).json({ message: "Target not found" });

    // if parent given, ensure parent exists and belongs to same target
    if (parent) {
      const p = await Comment.findById(parent);
      if (!p)
        return res.status(404).json({ message: "Parent comment not found" });
      // optional: ensure parent.targetType/targetId match provided target
      if (
        String(p.targetType) !== String(targetType) ||
        String(p.targetId) !== String(targetId)
      ) {
        return res
          .status(400)
          .json({ message: "Parent comment target mismatch" });
      }
    }

    // Prevent rapid duplicate comments (5 minute window)
    const duplicate = await Comment.findOne({
      user: userId,
      targetType,
      targetId,
      text,
      createdAt: { $gt: new Date(Date.now() - 1000 * 60 * 5) }, // 5 minutes
    });
    if (duplicate) {
      return res.status(429).json({
        message:
          "Duplicate comment detected — try editing your previous comment.",
      });
    }

    // create comment
    const comment = await Comment.create({
      user: userId,
      targetType,
      targetId,
      externalId:
        externalId ||
        (targetType === "book"
          ? mongoose.isValidObjectId(targetId)
            ? (
                await Book.findById(targetId)
              ).externalId
            : null
          : null),
      text,
      parent: parent || null,
    });

    await comment.populate("user", "name username avatarUrl");

    // increment commentsCount on parent target (best-effort)
    const modelMap = { book: Book, review: Review, note: Note };
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

    // activity log
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

    return res.status(201).json({ comment });
  } catch (err) {
    next(err);
  }
}

/* GET /api/comments/:targetType/:targetId?page=1&limit=20
   returns top-level comments and their replies (one-level)
*/
export async function getCommentsByTarget(req, res, next) {
  try {
    let { targetType, targetId } = req.params;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    // Normalize book targetId if it's an externalId (e.g. "/works/OL82563W")
    if (targetType === "book" && !mongoose.isValidObjectId(targetId)) {
      const b = await Book.findOne({ externalId: targetId });
      if (b) targetId = b._id;
      else return res.json({ page, limit, total: 0, comments: [] });
    }

    const [comments, total] = await Promise.all([
      Comment.find({ targetType, targetId, parent: null, deleted: false })
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

    // fetch replies for these comments
    const ids = comments.map((c) => c._id);
    const replies = ids.length
      ? await Comment.find({ parent: { $in: ids }, deleted: false })
          .sort({ createdAt: 1 })
          .populate("user", "name username avatarUrl")
      : [];

    // group replies by parent id
    const replyMap = {};
    for (const r of replies) {
      const pid = String(r.parent);
      if (!replyMap[pid]) replyMap[pid] = [];
      replyMap[pid].push(r);
    }

    const result = comments.map((c) => {
      return {
        ...c.toObject(),
        replies: replyMap[String(c._id)] || [],
      };
    });

    res.json({ page, limit, total, comments: result });
  } catch (err) {
    next(err);
  }
}

/* PATCH /api/comments/:id  (edit) */
export async function updateComment(req, res, next) {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const { text } = req.body;

    const comment = await Comment.findById(id);
    if (!comment || comment.deleted)
      return res.status(404).json({ message: "Comment not found" });
    if (String(comment.user) !== String(userId))
      return res.status(403).json({ message: "Not allowed" });

    if (text !== undefined) comment.text = text;
    comment.editedAt = new Date();
    await comment.save();
    await comment.populate("user", "name username avatarUrl");

    // activity
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

/* DELETE /api/comments/:id  (soft delete) */
export async function deleteComment(req, res, next) {
  try {
    const userId = req.user.id;
    const id = req.params.id;

    const comment = await Comment.findById(id);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    if (String(comment.user) !== String(userId))
      return res.status(403).json({ message: "Not allowed" });

    // soft delete: mark text & deleted flag
    comment.deleted = true;
    comment.text = "[deleted]";
    await comment.save();

    // decrement commentsCount on parent target (best-effort)
    const modelMap = { book: Book, review: Review, note: Note };
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

    // activity
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
