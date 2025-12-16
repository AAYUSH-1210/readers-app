// backend/src/controllers/bookclub.controller.js
//
// Book Club controller
//
// Responsibilities:
// - Create and manage book clubs
// - Handle membership lifecycle
// - Enforce privacy & ownership rules
//
// Roles:
// - owner   → BookClub.owner (implicit, not in membership)
// - admin   → BookClubMember.role
// - member  → BookClubMember.role

import mongoose from "mongoose";
import BookClub from "../models/BookClub.js";
import BookClubMember from "../models/BookClubMember.js";

/* ======================================================
   CREATE CLUB
   POST /api/bookclubs
====================================================== */
export async function createClub(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, description, isPublic = true, book } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Club name is required" });
    }

    const club = await BookClub.create({
      name: name.trim(),
      description: description || "",
      isPublic,
      book: book || null,
      owner: userId,
      createdBy: userId,
    });

    // Creator becomes admin member
    await BookClubMember.create({
      club: club._id,
      user: userId,
      role: "admin",
    });

    res.status(201).json({ club });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   LIST PUBLIC CLUBS
   GET /api/bookclubs
====================================================== */
export async function listPublicClubs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const filter = { isPublic: true };

    const [clubs, total] = await Promise.all([
      BookClub.find(filter)
        .populate("createdBy", "username avatarUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BookClub.countDocuments(filter),
    ]);

    res.json({ page, limit, total, clubs });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   CLUB DETAILS
   GET /api/bookclubs/:id
====================================================== */
export async function getClubDetails(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid club id" });
    }

    const club = await BookClub.findById(id)
      .populate("createdBy", "username avatarUrl")
      .populate("book", "title authors cover externalId")
      .lean();

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    const membersCount = await BookClubMember.countDocuments({ club: id });

    res.json({ club: { ...club, membersCount } });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   JOIN CLUB
   POST /api/bookclubs/:clubId/join
====================================================== */
export async function joinBookClub(req, res, next) {
  try {
    const userId = req.user.id;
    const { clubId } = req.params;

    if (!mongoose.isValidObjectId(clubId)) {
      return res.status(400).json({ message: "Invalid club id" });
    }

    const club = await BookClub.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (!club.isPublic) {
      return res.status(403).json({ message: "Club is private" });
    }

    const exists = await BookClubMember.findOne({
      club: clubId,
      user: userId,
    });

    if (exists) {
      return res.status(400).json({ message: "Already a member" });
    }

    const member = await BookClubMember.create({
      club: clubId,
      user: userId,
      role: "member",
    });

    res.status(201).json({ message: "Joined club successfully", member });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   LEAVE CLUB
   POST /api/bookclubs/:clubId/leave
====================================================== */
export async function leaveBookClub(req, res, next) {
  try {
    const userId = req.user.id;
    const { clubId } = req.params;

    const membership = await BookClubMember.findOne({
      club: clubId,
      user: userId,
    });

    if (!membership) {
      return res.status(400).json({ message: "Not a member of this club" });
    }

    // Owner cannot leave their own club
    const club = await BookClub.findById(clubId).select("owner");
    if (club && String(club.owner) === String(userId)) {
      return res.status(400).json({
        message: "Owner cannot leave the club",
      });
    }

    await membership.deleteOne();
    res.json({ message: "Left club successfully" });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   LIST MEMBERS
   GET /api/bookclubs/:id/members
====================================================== */
export async function listClubMembers(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid club id" });
    }

    const members = await BookClubMember.find({ club: id })
      .populate("user", "username avatarUrl")
      .sort({ role: 1, createdAt: 1 })
      .lean();

    res.json({ members });
  } catch (err) {
    next(err);
  }
}
