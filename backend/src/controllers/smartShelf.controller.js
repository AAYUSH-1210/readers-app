// backend/src/controllers/smartShelf.controller.js
//
// Smart Shelf controller.
//
// Responsibilities:
// - Generate virtual shelves derived from user activity
// - No persistence (computed on the fly)
// - Supports pagination
//
// Supported types:
// - finished
// - reading
// - to-read
// - favorites
// - recent
// - top-rated
//
// Notes:
// - Smart shelves are read-only
// - Items always include populated `book`

import Reading from "../models/Reading.js";
import Favorite from "../models/Favorite.js";
import Review from "../models/Review.js";

/* ======================================================
   Helpers
====================================================== */

/**
 * Parse pagination params.
 */
function parsePageLimit(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/* ======================================================
   GET /api/smart-shelves
   Returns available shelf types + counts
====================================================== */
export async function getAvailableShelves(req, res, next) {
  try {
    const userId = req.user.id;

    const [finishedCount, readingCount, toReadCount, favCount, reviewCount] =
      await Promise.all([
        Reading.countDocuments({ user: userId, status: "finished" }),
        Reading.countDocuments({ user: userId, status: "reading" }),
        Reading.countDocuments({ user: userId, status: "to-read" }),
        Favorite.countDocuments({ user: userId }),
        Review.countDocuments({ user: userId }),
      ]);

    // best-effort recent sample (used only for UI preview)
    const recentReading = await Reading.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .select("book")
      .lean();

    const recentFavorite = await Favorite.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .select("book")
      .lean();

    const recentSample = recentReading?.book || recentFavorite?.book || null;

    res.json({
      shelves: [
        { key: "finished", title: "Finished", count: finishedCount },
        { key: "reading", title: "Reading", count: readingCount },
        { key: "to-read", title: "To Read", count: toReadCount },
        { key: "favorites", title: "Favorites", count: favCount },
        { key: "top-rated", title: "Top Rated", count: reviewCount },
        {
          key: "recent",
          title: "Recently Added",
          sampleBookId: recentSample,
        },
      ],
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/smart-shelves/:type
====================================================== */
export async function getSmartShelfItems(req, res, next) {
  try {
    const userId = req.user.id;
    const type = req.params.type;
    const { page, limit, skip } = parsePageLimit(req);

    const allowed = [
      "finished",
      "reading",
      "to-read",
      "favorites",
      "recent",
      "top-rated",
    ];

    if (!allowed.includes(type)) {
      return res.status(400).json({ message: "Invalid shelf type" });
    }

    /* ---------- Reading-based shelves ---------- */
    if (["finished", "reading", "to-read"].includes(type)) {
      const status = type === "to-read" ? "to-read" : type;

      const [items, total] = await Promise.all([
        Reading.find({ user: userId, status })
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("book"),
        Reading.countDocuments({ user: userId, status }),
      ]);

      return res.json({
        page,
        limit,
        total,
        items: items.map((r) => ({
          source: "reading",
          readingId: r._id,
          status: r.status,
          progress: r.progress,
          addedAt: r.createdAt,
          updatedAt: r.updatedAt,
          book: r.book,
        })),
      });
    }

    /* ---------- Favorites ---------- */
    if (type === "favorites") {
      const [items, total] = await Promise.all([
        Favorite.find({ user: userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("book"),
        Favorite.countDocuments({ user: userId }),
      ]);

      return res.json({
        page,
        limit,
        total,
        items: items.map((f) => ({
          source: "favorite",
          favoriteId: f._id,
          addedAt: f.createdAt,
          note: f.note,
          book: f.book,
        })),
      });
    }

    /* ---------- Recent ---------- */
    if (type === "recent") {
      // Note: this is a merged, best-effort recency view (not exact pagination)
      const recentReadings = await Reading.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit * 2)
        .populate("book");

      const recentFavorites = await Favorite.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit * 2)
        .populate("book");

      const map = new Map();

      for (const r of recentReadings) {
        if (r.book) {
          map.set(String(r.book._id), {
            source: "reading",
            addedAt: r.createdAt,
            book: r.book,
          });
        }
      }

      for (const f of recentFavorites) {
        if (f.book) {
          map.set(String(f.book._id), {
            source: "favorite",
            addedAt: f.createdAt,
            book: f.book,
          });
        }
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => b.addedAt - a.addedAt
      );

      return res.json({
        page,
        limit,
        total: merged.length,
        items: merged.slice(skip, skip + limit),
      });
    }

    /* ---------- Top Rated ---------- */
    if (type === "top-rated") {
      const [reviews, total] = await Promise.all([
        Review.find({ user: userId })
          .sort({ rating: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("book"),
        Review.countDocuments({ user: userId }),
      ]);

      return res.json({
        page,
        limit,
        total,
        items: reviews.map((rv) => ({
          source: "review",
          reviewId: rv._id,
          rating: rv.rating,
          text: rv.text,
          createdAt: rv.createdAt,
          book: rv.book,
        })),
      });
    }

    res.json({ page, limit, total: 0, items: [] });
  } catch (err) {
    next(err);
  }
}
