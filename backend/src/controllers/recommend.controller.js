// backend/src/controllers/recommend.controller.js
// Recommendation controller.
//
// Responsibilities:
// - Expose recommendation endpoints for the current user
// - Provide similar-book and popular-book discovery endpoints
// - Delegate all heavy logic to utils/recommender.js
//
// Notes:
// - Uses recommender *utilities* directly (not services)
// - Assumes authentication middleware populates req.user.id
// - Supports both Mongo ObjectId and OpenLibrary externalId lookups

import {
  recommendForUser,
  contentBasedSimilar,
  collaborativeSimilar,
  popularBooks,
} from "../utils/recommender.js";
import Book from "../models/Book.js";

/**
 * GET /api/recommend/me
 *
 * Query params:
 * - seedBookId (optional)
 * - limit (default 20, max 50)
 *
 * Returns personalized recommendations for the current user.
 */
export async function recommendForMe(req, res, next) {
  try {
    const userId = req.user.id;
    const seedBookId = req.query.seedBookId || null;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    const books = await recommendForUser(userId, {
      seedBookId,
      limit,
    });

    res.json({ books });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/recommend/similar/:bookId
 *
 * Returns a deduplicated mix of content-based and collaborative
 * recommendations for a given book.
 *
 * Supports:
 * - Mongo ObjectId
 * - OpenLibrary externalId (with or without leading slash)
 */
export async function similarToBook(req, res, next) {
  try {
    const bookId = req.params.bookId;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    if (!bookId) {
      return res.status(400).json({ message: "bookId required" });
    }

    let book = null;

    // If not a Mongo ObjectId, attempt externalId lookup
    if (!bookId.match(/^[0-9a-fA-F]{24}$/)) {
      book =
        (await Book.findOne({ externalId: bookId })) ||
        (await Book.findOne({
          externalId: `/${bookId}`,
        }));
    } else {
      book = await Book.findById(bookId);
    }

    if (!book) {
      return res.status(404).json({
        message: "Recommendation target book not found",
        code: "BOOK_NOT_FOUND",
      });
    }

    // Split budget between content-based and collaborative
    const c = await contentBasedSimilar(book._id, {
      limit: Math.ceil(limit / 2),
    });

    const col = await collaborativeSimilar(book._id, {
      limit: Math.ceil(limit / 2),
    });

    // Merge & deduplicate
    const seen = new Set();
    const items = [];

    for (const b of [...c, ...col]) {
      if (!b) continue;
      const id = String(b._id);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(b);
      if (items.length >= limit) break;
    }

    res.json({ books: items });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/recommend/popular
 *
 * Returns globally popular books (cold-start fallback).
 */
export async function getPopular(req, res, next) {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));

    const books = await popularBooks({ limit });
    res.json({ books });
  } catch (err) {
    next(err);
  }
}
