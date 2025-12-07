// backend/src/controllers/smartShelf.controller.js
import Reading from "../models/Reading.js";
import Favorite from "../models/Favorite.js";
import Review from "../models/Review.js";
import Book from "../models/Book.js";

/**
 * Returns items for smart shelves computed from existing collections.
 *
 * Types supported:
 * - finished
 * - reading
 * - to-read
 * - favorites
 * - recent (recently added to reading list or favorites or shelves)
 * - top-rated (books user rated highest via reviews)
 *
 * Each "item" includes populated book and the source (reading/favorite/review).
 */

/* Helper: paginate params */
function parsePageLimit(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/* GET /api/smart-shelves  -> returns available shelf types + summary counts */
export async function getAvailableShelves(req, res, next) {
  try {
    const userId = req.user.id;

    // count finished/reading/to-read in Reading
    const [finishedCount, readingCount, toReadCount, favCount, reviewCount] =
      await Promise.all([
        Reading.countDocuments({ user: userId, status: "finished" }),
        Reading.countDocuments({ user: userId, status: "reading" }),
        Reading.countDocuments({ user: userId, status: "to-read" }),
        Favorite.countDocuments({ user: userId }),
        Review.countDocuments({ user: userId }),
      ]);

    // recently added: use reading and favorites most recent
    const recentReading = await Reading.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(1);
    const recentFavorite = await Favorite.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(1);
    const recentSample =
      (recentReading[0] && recentReading[0].book) ||
      (recentFavorite[0] && recentFavorite[0].book) ||
      null;

    const shelves = [
      { key: "finished", title: "Finished", count: finishedCount },
      { key: "reading", title: "Reading", count: readingCount },
      { key: "to-read", title: "To Read", count: toReadCount },
      { key: "favorites", title: "Favorites", count: favCount },
      { key: "top-rated", title: "Top Rated", count: reviewCount },
      {
        key: "recent",
        title: "Recently Added",
        sampleBookId: recentSample ? recentSample : null,
      },
    ];

    res.json({ shelves });
  } catch (err) {
    next(err);
  }
}

/* GET /api/smart-shelves/:type
   types: finished | reading | to-read | favorites | recent | top-rated
   pagination: page, limit
*/
export async function getSmartShelfItems(req, res, next) {
  try {
    const userId = req.user.id;
    const type = req.params.type;
    const { page, limit, skip } = parsePageLimit(req);

    if (
      ![
        "finished",
        "reading",
        "to-read",
        "favorites",
        "recent",
        "top-rated",
      ].includes(type)
    ) {
      return res.status(400).json({ message: "Invalid shelf type" });
    }

    if (type === "finished" || type === "reading" || type === "to-read") {
      const status = type === "to-read" ? "to-read" : type;
      const [items, total] = await Promise.all([
        Reading.find({ user: userId, status })
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("book"),
        Reading.countDocuments({ user: userId, status }),
      ]);

      // map to unified item shape
      const docs = items.map((r) => ({
        source: "reading",
        readingId: r._id,
        status: r.status,
        progress: r.progress,
        addedAt: r.createdAt,
        updatedAt: r.updatedAt,
        book: r.book,
      }));

      return res.json({ page, limit, total, items: docs });
    }

    if (type === "favorites") {
      const [items, total] = await Promise.all([
        Favorite.find({ user: userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("book"),
        Favorite.countDocuments({ user: userId }),
      ]);

      const docs = items.map((f) => ({
        source: "favorite",
        favoriteId: f._id,
        addedAt: f.createdAt,
        note: f.note,
        book: f.book,
      }));

      return res.json({ page, limit, total, items: docs });
    }

    if (type === "recent") {
      // Use union of Reading and Favorite for recency
      const recentReadings = await Reading.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit * 2)
        .populate("book");
      const recentFavorites = await Favorite.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit * 2)
        .populate("book");

      // merge while keeping uniqueness by book._id
      const map = new Map();
      for (const r of recentReadings) {
        if (r.book)
          map.set(String(r.book._id), {
            source: "reading",
            addedAt: r.createdAt,
            book: r.book,
          });
      }
      for (const f of recentFavorites) {
        if (f.book)
          map.set(String(f.book._id), {
            source: "favorite",
            addedAt: f.createdAt,
            book: f.book,
          });
      }

      const merged = Array.from(map.values()).sort(
        (a, b) => b.addedAt - a.addedAt
      );
      const total = merged.length;
      const paged = merged.slice(skip, skip + limit);
      return res.json({ page, limit, total, items: paged });
    }

    if (type === "top-rated") {
      // user's own highest rated books by review rating
      // aggregate reviews by user, sort by rating desc and createdAt desc
      const reviews = await Review.find({ user: userId })
        .sort({ rating: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("book");
      const total = await Review.countDocuments({ user: userId });

      const items = reviews.map((rv) => ({
        source: "review",
        reviewId: rv._id,
        rating: rv.rating,
        text: rv.text,
        createdAt: rv.createdAt,
        book: rv.book,
      }));

      return res.json({ page, limit, total, items });
    }

    // fallback (shouldn't happen)
    res.json({ page, limit, total: 0, items: [] });
  } catch (err) {
    next(err);
  }
}
