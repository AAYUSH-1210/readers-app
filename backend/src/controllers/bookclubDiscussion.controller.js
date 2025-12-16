// backend/src/controllers/bookclubDiscussion.controller.js
//
// Book Club Discussion controller
//
// Responsibilities:
// - Create discussions inside book clubs
// - Enforce membership & privacy rules
// - Support pagination & soft deletes

import mongoose from "mongoose";
import BookClub from "../models/BookClub.js";
import BookClubMember from "../models/BookClubMember.js";
import BookClubDiscussion from "../models/BookClubDiscussion.js";

/* ======================================================
   Helpers
====================================================== */

/**
 * Check whether a user is a member of a club.
 */
async function isMember(userId, clubId) {
  if (!userId || !mongoose.isValidObjectId(clubId)) return false;

  const member = await BookClubMember.findOne({
    club: clubId,
    user: userId,
  }).select("_id");

  return Boolean(member);
}

/* ======================================================
   CREATE DISCUSSION
   POST /api/bookclubs/:clubId/discussions
====================================================== */
export async function createDiscussion(req, res, next) {
  try {
    const userId = req.user.id;
    const { clubId } = req.params;
    const { title, body, book, chapter } = req.body;

    if (!mongoose.isValidObjectId(clubId)) {
      return res.status(400).json({ message: "Invalid club id" });
    }

    if (!title || !body) {
      return res.status(400).json({
        message: "Title and body are required",
      });
    }

    const club = await BookClub.findById(clubId).select("isPublic");
    if (!club) {
      return res.status(404).json({ message: "Book club not found" });
    }

    const member = await isMember(userId, clubId);
    if (!member) {
      return res.status(403).json({
        message: "Join the club to post discussions",
      });
    }

    const discussion = await BookClubDiscussion.create({
      club: clubId,
      author: userId,
      title,
      body,
      book: book || null,
      chapter: chapter || null,
    });

    res.status(201).json({ discussion });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   LIST DISCUSSIONS
   GET /api/bookclubs/:clubId/discussions
====================================================== */
export async function listDiscussions(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const { clubId } = req.params;

    if (!mongoose.isValidObjectId(clubId)) {
      return res.status(400).json({ message: "Invalid club id" });
    }

    const club = await BookClub.findById(clubId).select("isPublic");
    if (!club) {
      return res.status(404).json({ message: "Book club not found" });
    }

    // Private club → membership required
    if (!club.isPublic) {
      const member = await isMember(userId, clubId);
      if (!member) {
        return res.status(403).json({ message: "Club is private" });
      }
    }

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      BookClubDiscussion.find({ club: clubId, isDeleted: false })
        .populate("author", "username avatarUrl")
        .populate("book", "title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      BookClubDiscussion.countDocuments({
        club: clubId,
        isDeleted: false,
      }),
    ]);

    res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET SINGLE DISCUSSION
   GET /api/discussions/:id
====================================================== */
export async function getDiscussion(req, res, next) {
  try {
    const userId = req.user?.id || null;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid discussion id" });
    }

    const discussion = await BookClubDiscussion.findById(id)
      .populate("author", "username avatarUrl")
      .populate("book", "title")
      .lean();

    if (!discussion || discussion.isDeleted) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    // Enforce club privacy
    const club = await BookClub.findById(discussion.club).select("isPublic");
    if (!club) {
      return res.status(404).json({ message: "Book club not found" });
    }

    if (!club.isPublic) {
      const member = await isMember(userId, discussion.club);
      if (!member) {
        return res.status(403).json({ message: "Club is private" });
      }
    }

    res.json({ discussion });
  } catch (err) {
    next(err);
  }
}
