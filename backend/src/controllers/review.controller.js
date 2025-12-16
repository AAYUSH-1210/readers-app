// backend/src/controllers/review.controller.js
// Review controller.
//
// Responsibilities:
// - Create, update, delete user reviews
// - Fetch reviews by book or by user
// - Ensure one review per (user, book)
// - Lazily create minimal Book documents when needed
//
// Design notes:
// - Reviews created by users are HARD-deleted by the user
// - Admin moderation uses SOFT delete (see admin.controller.js)
// - Book creation here is intentionally minimal and may be enriched later
// - External ID normalization must stay aligned with book.controller.js

import Review from "../models/Review.js";
import Book from "../models/Book.js";

/**
 * Normalize OpenLibrary externalId.
 *
 * Supported inputs:
 * - "/works/OL82563W"
 * - "OL82563W"
 * - "/books/OL123M"
 * - "OL123M"
 * - "works/OL82563W"
 *
 * Canonical form:
 * - "/works/OLxxxxxW" or "/books/OLxxxxxM"
 *
 * NOTE:
 * - This logic is duplicated in book.controller.js by design (for now).
 * - Any change here MUST be mirrored there to avoid data divergence.
 */
function normalizeExternalId(externalId) {
  if (!externalId) return null;

  externalId = String(externalId).trim();

  if (externalId.startsWith("/")) return externalId;
  if (/^OL.*W$/.test(externalId)) return `/works/${externalId}`;
  if (/^OL.*M$/.test(externalId)) return `/books/${externalId}`;

  // Handles "works/OL82563W" or "books/OL123M"
  if (externalId.startsWith("works/") || externalId.startsWith("books/")) {
    return `/${externalId}`;
  }

  // Fallback: return as-is
  return externalId;
}

/**
 * Find or create a minimal Book document for review association.
 *
 * IMPORTANT:
 * - This does NOT fetch full OpenLibrary metadata
 * - Only minimum fields are stored to allow reviews to exist immediately
 * - Book enrichment can happen later via book.controller.js
 */
async function findOrCreateBookByPayload({
  externalId,
  title,
  authors = [],
  cover = null,
  source = "openlibrary",
  raw = {},
}) {
  const normalized = normalizeExternalId(externalId);
  if (!normalized) {
    throw new Error("externalId required");
  }

  let book = await Book.findOne({ externalId: normalized });

  if (!book) {
    book = await Book.create({
      externalId: normalized,
      title: title || "Untitled",
      authors,
      cover,
      source,
      raw,
    });
  }

  return book;
}

/* ======================================================
   POST /api/reviews/add
====================================================== */

/**
 * Create a new review for a book.
 *
 * Constraints:
 * - One review per (user, book)
 * - Rating is clamped between 1 and 5
 */
export async function addReview(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId, title, authors, cover, rating, text } = req.body;

    if (!externalId) {
      return res.status(400).json({ message: "externalId is required" });
    }

    if (rating === undefined) {
      return res.status(400).json({ message: "rating is required" });
    }

    const normalized = normalizeExternalId(externalId);

    // Ensure book exists (minimal creation if needed)
    const book = await findOrCreateBookByPayload({
      externalId: normalized,
      title,
      authors,
      cover,
    });

    // Prevent duplicate reviews (nice error before unique index triggers)
    const existing = await Review.findOne({
      user: userId,
      book: book._id,
    });

    if (existing) {
      return res.status(409).json({
        message: "User has already reviewed this book",
        review: existing,
      });
    }

    const review = await Review.create({
      user: userId,
      book: book._id,
      externalId: normalized,
      rating: Math.max(1, Math.min(5, Number(rating))),
      text: text || "",
    });

    await review.populate("user", "-passwordHash");
    await review.populate("book");

    res.status(201).json({ review });
  } catch (err) {
    // Defensive handling for race-condition duplicate inserts
    if (err && err.code === 11000) {
      return res.status(409).json({
        message: "Duplicate review (user already reviewed this book)",
      });
    }
    next(err);
  }
}

/* ======================================================
   GET /api/reviews/book/:externalId
====================================================== */

/**
 * Get reviews for a book identified by externalId.
 * Returns empty list if the book does not exist locally.
 */
export async function getReviewsByBook(req, res, next) {
  try {
    const rawId = req.params.externalId;

    if (!rawId) {
      return res.status(400).json({ message: "externalId required in path" });
    }

    const normalized = normalizeExternalId(rawId);

    const book = await Book.findOne({
      externalId: normalized,
    });

    if (!book) {
      return res.json({
        reviews: [],
        total: 0,
      });
    }

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ book: book._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name username avatarUrl"),
      Review.countDocuments({ book: book._id }),
    ]);

    res.json({ reviews, total, page, limit });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/reviews/user/:userId
====================================================== */

/**
 * Get reviews written by a specific user.
 */
export async function getReviewsByUser(req, res, next) {
  try {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ message: "userId required in path" });
    }

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      Review.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("book"),
      Review.countDocuments({ user: userId }),
    ]);

    res.json({ reviews, total, page, limit });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   PATCH /api/reviews/:id
====================================================== */

/**
 * Update an existing review.
 * Only the review owner may edit.
 */
export async function updateReview(req, res, next) {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const { rating, text } = req.body;

    const review = await Review.findById(id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (String(review.user) !== String(userId)) {
      return res.status(403).json({
        message: "Not authorized to edit this review",
      });
    }

    let changed = false;

    if (rating !== undefined) {
      review.rating = Math.max(1, Math.min(5, Number(rating)));
      changed = true;
    }

    if (text !== undefined) {
      review.text = text;
      changed = true;
    }

    if (changed) {
      review.editedAt = new Date();
      await review.save();
    }

    await review.populate("user", "name username");
    await review.populate("book");

    res.json({ review });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   DELETE /api/reviews/:id
====================================================== */

/**
 * Delete a review.
 *
 * NOTE:
 * - This is a HARD delete performed by the review owner.
 * - Admin moderation uses soft delete instead.
 */
export async function deleteReview(req, res, next) {
  try {
    const userId = req.user.id;
    const id = req.params.id;

    const review = await Review.findById(id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (String(review.user) !== String(userId)) {
      return res.status(403).json({
        message: "Not authorized to delete this review",
      });
    }

    await Review.findByIdAndDelete(id);

    res.json({ message: "deleted" });
  } catch (err) {
    next(err);
  }
}
