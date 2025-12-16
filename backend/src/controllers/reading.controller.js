// backend/src/controllers/reading.controller.js
//
// Reading controller.
//
// Responsibilities:
// - Manage a user's reading lifecycle for a book
// - Ensure referenced Book exists (lazy creation)
// - Prevent duplicate reading entries per user+book
// - Support status transitions: to-read | reading | finished
//
// Notes:
// - Reading entries are strictly user-owned
// - One reading entry per user per book
// - Analytics & feed consume this data downstream

import mongoose from "mongoose";
import Reading from "../models/Reading.js";
import Book from "../models/Book.js";

/* ======================================================
   Helpers
====================================================== */

/**
 * Normalize OpenLibrary externalId formats.
 */
function normalizeExternalId(externalId) {
  if (!externalId) return null;
  externalId = externalId.trim();

  if (externalId.startsWith("/")) return externalId;
  if (/^OL.*W$/.test(externalId)) return `/works/${externalId}`;
  if (/^OL.*M$/.test(externalId)) return `/books/${externalId}`;
  if (externalId.startsWith("works/") || externalId.startsWith("books/")) {
    return `/${externalId}`;
  }
  return externalId;
}

/**
 * Ensure a Book exists.
 */
async function findOrCreateBook({
  externalId,
  title,
  authors = [],
  cover = null,
}) {
  const normalized = normalizeExternalId(externalId);

  let book = await Book.findOne({ externalId: normalized });
  if (!book) {
    book = await Book.create({
      externalId: normalized,
      title: title || "",
      authors,
      cover,
      source: "openlibrary",
    });
  }

  return book;
}

/* ======================================================
   POST /api/reading/add
====================================================== */
/**
 * Add or update reading status for a book.
 *
 * body:
 * - externalId (required)
 * - status: to-read | reading | finished (required)
 * - title, authors, cover (optional)
 */
export async function addOrUpdateReading(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId, status, title, authors, cover } = req.body;

    if (!externalId || !status) {
      return res.status(400).json({
        message: "externalId and status are required",
      });
    }

    if (!["to-read", "reading", "finished"].includes(status)) {
      return res.status(400).json({
        message: "Invalid reading status",
      });
    }

    const book = await findOrCreateBook({
      externalId,
      title,
      authors,
      cover,
    });

    let reading = await Reading.findOne({
      user: userId,
      book: book._id,
    });

    if (!reading) {
      reading = await Reading.create({
        user: userId,
        book: book._id,
        externalId: book.externalId,
        status,
        startedAt: status === "reading" ? new Date() : null,
        finishedAt: status === "finished" ? new Date() : null,
      });
    } else {
      // Handle status transitions
      if (status === "reading" && reading.status !== "reading") {
        reading.startedAt = new Date();
      }
      if (status === "finished" && reading.status !== "finished") {
        reading.finishedAt = new Date();
      }

      reading.status = status;
      await reading.save();
    }

    await reading.populate("book");

    res.json({ reading });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/reading/me
====================================================== */
/**
 * Get all reading entries for current user.
 */
export async function getMyReading(req, res, next) {
  try {
    const userId = req.user.id;

    const items = await Reading.find({ user: userId })
      .sort({ updatedAt: -1 })
      .populate("book");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/reading/status/:status
====================================================== */
/**
 * Get reading entries by status.
 */
export async function getMyReadingByStatus(req, res, next) {
  try {
    const userId = req.user.id;
    const { status } = req.params;

    if (!["to-read", "reading", "finished"].includes(status)) {
      return res.status(400).json({
        message: "Invalid reading status",
      });
    }

    const items = await Reading.find({
      user: userId,
      status,
    })
      .sort({ updatedAt: -1 })
      .populate("book");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   DELETE /api/reading/:id
====================================================== */
/**
 * Remove a reading entry.
 */
export async function removeReading(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid reading id",
      });
    }

    const reading = await Reading.findById(id);
    if (!reading) {
      return res.status(404).json({
        message: "Reading entry not found",
      });
    }

    if (String(reading.user) !== String(userId)) {
      return res.status(403).json({
        message: "Not allowed",
      });
    }

    await Reading.findByIdAndDelete(id);

    res.json({ message: "deleted" });
  } catch (err) {
    next(err);
  }
}
