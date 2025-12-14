import mongoose from "mongoose";
import BookClub from "../models/BookClub.js";
import BookClubMember from "../models/BookClubMember.js";
import BookClubDiscussion from "../models/BookClubDiscussion.js";

/* ===============================
   Helpers
================================ */

async function ensureMember(userId, clubId) {
  const member = await BookClubMember.findOne({
    club: clubId,
    user: userId,
  });
  return !!member;
}

/* ===============================
   CREATE DISCUSSION
   POST /api/bookclubs/:clubId/discussions
================================ */

export async function createDiscussion(req, res, next) {
  try {
    const userId = req.user.id;
    const { clubId } = req.params;
    const { title, body, book, chapter } = req.body;

    if (!title || !body) {
      return res.status(400).json({ message: "Title and body are required" });
    }

    const club = await BookClub.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Book club not found" });
    }

    const isMember = await ensureMember(userId, clubId);
    if (!isMember) {
      return res
        .status(403)
        .json({ message: "Join the club to post discussions" });
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

/* ===============================
   LIST DISCUSSIONS
   GET /api/bookclubs/:clubId/discussions
================================ */

export async function listDiscussions(req, res, next) {
  try {
    const userId = req.user?.id;
    const { clubId } = req.params;

    const club = await BookClub.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Book club not found" });
    }

    // Private club → must be member
    if (!club.isPublic) {
      const isMember = userId && (await ensureMember(userId, clubId));
      if (!isMember) {
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

      BookClubDiscussion.countDocuments({ club: clubId, isDeleted: false }),
    ]);

    res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
}

/* ===============================
   GET SINGLE DISCUSSION
   GET /api/discussions/:id
================================ */

export async function getDiscussion(req, res, next) {
  try {
    const { id } = req.params;

    const discussion = await BookClubDiscussion.findById(id)
      .populate("author", "username avatarUrl")
      .populate("book", "title")
      .lean();

    if (!discussion || discussion.isDeleted) {
      return res.status(404).json({ message: "Discussion not found" });
    }

    res.json({ discussion });
  } catch (err) {
    next(err);
  }
}
