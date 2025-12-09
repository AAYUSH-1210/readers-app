// backend/src/services/trending.service.js
import Review from "../models/Review.js";
import Book from "../models/Book.js";
import Reading from "../models/Reading.js";

const DEFAULT_WINDOW_DAYS = 7;
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export default {
  /**
   * getTrendingBooks(limit, { windowDays })
   * - Always returns an array.
   * - If no recent activity, returns popular books as a fallback with fallback:true.
   */
  async getTrendingBooks(
    limit = 20,
    { windowDays = DEFAULT_WINDOW_DAYS } = {}
  ) {
    const recentSince = daysAgo(windowDays);

    const pipeline = [
      { $match: { createdAt: { $gte: recentSince } } },
      {
        $group: {
          _id: "$bookId",
          recentReviews: { $sum: 1 },
          avgRatingNow: { $avg: "$rating" },
          reviewsAllCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
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
                cond: { $gte: ["$$r.startedAt", recentSince] },
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
      { $unwind: { path: "$book", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          book: 1,
          recentReviews: 1,
          avgRatingNow: 1,
          readingStarts: 1,
          reviewsAllCount: 1,
        },
      },
      // keep a larger candidate set, we'll filter null-books after
      { $sort: { recentReviews: -1 } },
      { $limit: limit * 3 },
    ];

    const rows = await Review.aggregate(pipeline).allowDiskUse(true).exec();

    // Filter out rows with missing book doc
    const rowsWithBook = (rows || []).filter((r) => r.book && r.book._id);

    // If nothing meaningful, fallback to popular books
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

    // Score by normalized recentReviews + readingStarts
    const recentArr = rowsWithBook.map((r) => r.recentReviews || 0);
    const readArr = rowsWithBook.map((r) => r.readingStarts || 0);

    const minMax = (arr) => {
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const range = max - min || 1;
      return arr.map((v) => (v - min) / range);
    };

    const normRecent = minMax(recentArr);
    const normRead = minMax(readArr);

    const items = rowsWithBook.map((r, i) => {
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

    // sort and return top N
    items.sort((a, b) => b.trendingScore - a.trendingScore);
    return items.slice(0, limit);
  },
};
