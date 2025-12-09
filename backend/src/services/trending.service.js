// backend/src/services/trending.service.js
import mongoose from "mongoose";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js"; // model that records read/start events (adjust if different)
import { ObjectId } from "mongodb";

/**
 * Compute trending books over a recent window (defaults 7 days).
 * Returns array of { book, trendingScore, recentReviews, readingStarts }
 */
const DEFAULT_WINDOW_DAYS = 7;

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export default {
  /**
   * Returns top N trending candidate books with a trendingScore.
   */
  async getTrendingBooks(
    limit = 100,
    sinceDate = null,
    windowDays = DEFAULT_WINDOW_DAYS
  ) {
    const since = sinceDate ? new Date(sinceDate) : isoDaysAgo(windowDays);

    // Aggregation:
    // - Count recent reviews per book
    // - Count reading starts per book
    // - Compute small rating velocity (avgRating this window - avgRating 30-60d ago) if available
    // - Join book doc
    const pipeline = [
      // recent reviews
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$bookId",
          recentReviews: { $sum: 1 },
          avgRatingNow: { $avg: "$rating" },
        },
      },
      {
        $lookup: {
          from: "readings",
          localField: "_id",
          foreignField: "bookId",
          as: "readings",
        },
      },
      // compute readingStarts from readings array (we still filter by createdAt)
      {
        $addFields: {
          readingStarts: {
            $size: {
              $filter: {
                input: "$readings",
                as: "r",
                cond: { $gte: ["$$r.startedAt", since] },
              },
            },
          },
        },
      },
      // join book
      {
        $lookup: {
          from: "books",
          localField: "_id",
          foreignField: "_id",
          as: "book",
        },
      },
      { $unwind: "$book" },
      {
        $project: {
          book: 1,
          recentReviews: 1,
          avgRatingNow: 1,
          readingStarts: 1,
        },
      },
      // optional: compute normalized trending score by simple heuristic
      {
        $addFields: {
          trendingScore: {
            $add: [
              {
                $multiply: [
                  0.55,
                  { $min: [1, { $divide: ["$recentReviews", 20] }] },
                ],
              }, // recent reviews influence
              {
                $multiply: [
                  0.25,
                  { $min: [1, { $divide: ["$readingStarts", 20] }] },
                ],
              }, // starts influence
              {
                $multiply: [
                  0.2,
                  { $min: [1, { $divide: [{ $abs: "$avgRatingNow" }, 5] }] },
                ],
              }, // rating factor (small)
            ],
          },
        },
      },
      { $sort: { trendingScore: -1, recentReviews: -1 } },
      { $limit: limit },
    ];

    // Execute on reviews collection
    const results = await Review.aggregate(pipeline).allowDiskUse(true).exec();

    // Map to return consistent shape
    return results.map((r) => ({
      book: r.book,
      trendingScore: r.trendingScore,
      recentReviews: r.recentReviews,
      readingStarts: r.readingStarts,
      score: r.trendingScore, // use `score` field for the composer
    }));
  },
};
