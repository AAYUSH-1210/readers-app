// backend/src/controllers/favorite.controller.js
//
// Favorite controller
//
// Responsibilities:
// - Add/remove favorite books for a user
// - Ensure referenced Book exists (lazy creation)
// - Prevent duplicate favorites
// - Support pagination & checks

import mongoose from "mongoose";
import Favorite from "../models/Favorite.js";
import Book from "../models/Book.js";

/* ======================================================
   Helpers
====================================================== */

function normalizeExternalId(externalId) {
  if (!externalId) return null;
  externalId = String(externalId).trim();

  if (externalId.startsWith("/")) return externalId;
  if (/^OL.*W$/.test(externalId)) return `/works/${externalId}`;
  if (/^OL.*M$/.test(externalId)) return `/books/${externalId}`;
  if (externalId.startsWith("works/") || externalId.startsWith("books/")) {
    return `/${externalId}`;
  }
  return externalId;
}

async function findOrCreateBook({ externalId, title, authors = [], cover }) {
  const normalized = normalizeExternalId(externalId);
  if (!normalized) throw new Error("externalId required");

  let book = await Book.findOne({ externalId: normalized });
  if (!book) {
    book = await Book.create({
      externalId: normalized,
      title: title || "Untitled",
      authors,
      cover: cover || null,
      source: "openlibrary",
    });
  }
  return book;
}

/* ======================================================
   POST /api/favorites/add
====================================================== */
export async function addFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId, title, authors, cover, note } = req.body;

    if (!externalId) {
      return res.status(400).json({ message: "externalId required" });
    }

    const book = await findOrCreateBook({
      externalId,
      title,
      authors,
      cover,
    });

    let favorite = await Favorite.findOne({
      user: userId,
      book: book._id,
    }).populate("book");

    if (favorite) {
      return res.status(200).json({ favorite });
    }

    favorite = await Favorite.create({
      user: userId,
      book: book._id,
      externalId: book.externalId,
      note: note || "",
    });

    await favorite.populate("book");

    res.status(201).json({ favorite });
  } catch (err) {
    // handle duplicate key race safely
    if (err?.code === 11000) {
      const book = await Book.findOne({
        externalId: normalizeExternalId(req.body.externalId),
      });
      if (!book) {
        return res.status(409).json({ message: "Duplicate favorite" });
      }

      const favorite = await Favorite.findOne({
        user: req.user.id,
        book: book._id,
      }).populate("book");

      return res.status(200).json({ favorite });
    }

    next(err);
  }
}

/* ======================================================
   GET /api/favorites/list
====================================================== */
export async function listFavorites(req, res, next) {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Favorite.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("book"),
      Favorite.countDocuments({ user: userId }),
    ]);

    res.json({ page, limit, total, items });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   DELETE /api/favorites/:id
====================================================== */
export async function removeFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid favorite id" });
    }

    const favorite = await Favorite.findOne({ _id: id, user: userId });
    if (!favorite) {
      return res.status(404).json({ message: "Favorite not found" });
    }

    await Favorite.findByIdAndDelete(id);
    res.json({ message: "removed" });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/favorites/check?externalId=
====================================================== */
export async function checkFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId } = req.query;

    if (!externalId) {
      return res.status(400).json({ message: "externalId required" });
    }

    const normalized = normalizeExternalId(externalId);
    const book = await Book.findOne({ externalId: normalized });

    if (!book) {
      return res.json({ inFavorites: false });
    }

    const favorite = await Favorite.findOne({
      user: userId,
      book: book._id,
    }).populate("book");

    res.json({
      inFavorites: Boolean(favorite),
      favorite: favorite || null,
    });
  } catch (err) {
    next(err);
  }
}
