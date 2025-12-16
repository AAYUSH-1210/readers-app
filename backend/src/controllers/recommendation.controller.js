// backend/src/controllers/recommend.controller.js
//
// Recommendation controller
//
// Responsibilities:
// - User-based recommendations
// - Similar book recommendations
// - Popular books fallback
//
// Notes:
// - This controller wraps legacy utils/recommender.js
// - FeedService is the primary consumer going forward

import mongoose from "mongoose";
import {
  recommendForUser,
  contentBasedSimilar,
  collaborativeSimilar,
  popularBooks,
} from "../utils/recommender.js";

/* ======================================================
   GET /api/recommend/me?seedBookId=&limit=
====================================================== */
export async function recommendForMe(req, res, next) {
  try {
    const userId = req.user.id;
    const seedBookId = req.query.seedBookId || null;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    const items = await recommendForUser(userId, {
      seedBookId,
      limit,
    });

    // Normalize output
    const books = (items || []).map((it) => {
      const book = it.book || it;
      return {
        book,
        score: it.score ?? null,
        sources: it.sources ?? [],
      };
    });

    res.json({
      count: books.length,
      books,
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/recommend/similar/:bookId?limit=
====================================================== */
export async function similarToBook(req, res, next) {
  try {
    const { bookId } = req.params;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    if (!bookId) {
      return res.status(400).json({ message: "bookId required" });
    }

    // Allow both ObjectId and externalId
    const isObjectId = mongoose.isValidObjectId(bookId);

    const half = Math.ceil(limit / 2);

    const [content, collaborative] = await Promise.all([
      contentBasedSimilar(bookId, { limit: half }),
      collaborativeSimilar(bookId, { limit: half }),
    ]);

    const seen = new Set();
    const books = [];

    for (const b of [...content, ...collaborative]) {
      if (!b || !b._id) continue;
      const id = String(b._id);
      if (seen.has(id)) continue;
      seen.add(id);
      books.push(b);
      if (books.length >= limit) break;
    }

    res.json({
      count: books.length,
      books,
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/recommend/popular?limit=
====================================================== */
export async function getPopular(req, res, next) {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const books = await popularBooks({ limit });

    res.json({
      count: books.length,
      books,
    });
  } catch (err) {
    next(err);
  }
}
