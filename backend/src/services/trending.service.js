// backend/src/services/trending.service.js
// Trending books service.
//
// Strategy:
// - Identify books with recent activity within a sliding time window
// - Combine multiple short-term signals:
//   * Recent review volume
//   * Reading starts
// - Normalize signals to avoid domination by outliers
// - Compute a blended trending score
// - Fallback to globally popular books if no recent activity exists
//
// Important assumptions:
// - Review documents contain a `bookId` field (intentional)
// - Reading documents contain a `bookId` field
// - This service is time-sensitive and intentionally not cached here
//   (caller may cache results)

import Review from "../models/Review.js";
import Book from "../models/Book.js";
import Reading from "../models/Reading.js";

const DEFAULT_WINDOW_DAYS = 7;

/**
 * Utility: returns Date object representing N days ago
 */
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export default {
  /**
   * getTrendingBooks(limit, { windowDays })
   *
   * Always returns an array of items:
   * {
   *   book,
   *   trendingScore,
   *   recentReviews,
   *   readingStarts,
   *   fallback
   * }
   *
   * If no recent activity is found, falls back to popular books
   * with fallback=true.
   */
  async getTrendingBooks(
    limit = 20,
    { windowDays = DEFAULT_WINDOW_DAYS } = {}
  ) {
    const recentSince = daysAgo(windowDays);

    // Aggregation pipeline:
    // - Aggregate recent reviews by bookId
    // - Join reading activity to capture momentum
    // - Join book documents for display fields
    const pipeline = [
      { $match: { createdAt: { $gte: recentSince } } },
      {
        $group: {
          _id: "$bookId", // depends on Review.bookId (intentional)
          recentReviews: { $sum: 1 },
          avgRatingNow: { $avg: "$rating" },

          // Reserved for future weighting / analytics
          reviewsAllCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          // Defensive collection name resolution
          from: (Reading.collection && Reading.collection.name) || "readings",
          localField: "_id",
          foreignField: "bookId",
          as: "readings",
        },
      },
      {
        $addFields: {
          readingStarts: {
            $size: {
              $filter: {
                input: "$readings",
                as: "r",
                cond: {
                  $gte: ["$$r.startedAt", recentSince],
                },
              },
            },
          },
        },
      },
      {
        $lookup: {
          from: (Book.collection && Book.collection.name) || "books",
          localField: "_id",
          foreignField: "_id",
          as: "book",
        },
      },
      {
        $unwind: {
          path: "$book",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          book: 1,
          recentReviews: 1,
          avgRatingNow: 1,
          readingStarts: 1,
          reviewsAllCount: 1,
        },
      },
      // Keep a larger candidate pool before scoring
      { $sort: { recentReviews: -1 } },
      { $limit: limit * 3 },
    ];

    const rows = await Review.aggregate(pipeline).allowDiskUse(true).exec();

    // Remove entries with missing book documents
    const rowsWithBook = (rows || []).filter((r) => r.book && r.book._id);

    /* -------------------------------------------------
       Fallback: no recent activity
    ------------------------------------------------- */
    if (!rowsWithBook.length) {
      const popular = await Book.find({})
        .sort({ ratingsCount: -1, avgRating: -1 })
        .limit(limit)
        .select("title authors coverUrl avgRating ratingsCount genres")
        .lean();

      return popular.map((b) => ({
        book: {
          _id: b._id,
          title: b.title,
          authors: b.authors || b.author,
          coverUrl: b.coverUrl || b.image,
          avgRating: b.avgRating,
        },
        trendingScore: 0,
        recentReviews: 0,
        readingStarts: 0,
        fallback: true,
      }));
    }

    /* -------------------------------------------------
       Score normalization
    ------------------------------------------------- */
    const recentArr = rowsWithBook.map((r) => r.recentReviews || 0);
    const readArr = rowsWithBook.map((r) => r.readingStarts || 0);

    // Min-max normalization with zero-range guard
    const minMax = (arr) => {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const range = max - min || 1; // avoid divide-by-zero
      return arr.map((v) => (v - min) / range);
    };

    const normRecent = minMax(recentArr);
    const normRead = minMax(readArr);

    const items = rowsWithBook.map((r, i) => {
      // Trending score favors review velocity with a reading-start boost
      const score = 0.7 * normRecent[i] + 0.3 * normRead[i];

      return {
        book: {
          _id: r.book._id,
          title: r.book.title,
          authors: r.book.authors || r.book.author,
          coverUrl: r.book.coverUrl || r.book.image,
          avgRating: r.avgRatingNow ?? r.book.avgRating,
        },
        trendingScore: score,
        recentReviews: r.recentReviews || 0,
        readingStarts: r.readingStarts || 0,
        fallback: false,
      };
    });

    // Sort by computed trending score
    items.sort((a, b) => b.trendingScore - a.trendingScore);

    return items.slice(0, limit);
  },
};
