// backend/src/services/social.service.js
// Social activity service.
//
// Purpose:
// - Build a social feed based on actions from users that the current user follows
// - Includes reviews and reading-status updates
//
// Design notes:
// - This service intentionally does NOT cache results (feed.service handles caching)
// - Uses batch-fetching to avoid N+1 query problems
// - Relies on Review.userId / Review.bookId and Reading.userId / Reading.bookId
//   field naming (intentional and documented)

import User from "../models/User.js";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js";
import Book from "../models/Book.js";

export default {
  /**
   * Returns recent activities from users that `userId` follows.
   *
   * Each item:
   * {
   *   type: "following",
   *   action: "review" | "started" | "finished",
   *   createdAt,
   *   book,
   *   actor,
   *   score,
   *   review?   // only for review actions
   * }
   */
  async getFollowedUsersUpdates(userId, limit = 100, sinceDate = null) {
    if (!userId) return [];

    // Fetch followed user ids
    const me = await User.findById(userId).select("following").lean();

    const follows =
      me && me.following ? me.following.map((f) => f.toString()) : [];

    if (!follows.length) return [];

    // Default window: last 7 days
    const since = sinceDate
      ? new Date(sinceDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    /* -------------------------------------------------
       Reviews by followed users
    ------------------------------------------------- */
    const reviews = await Review.find({
      userId: { $in: follows },
      createdAt: { $gte: since },
    })
      .select("userId bookId rating content createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    /* -------------------------------------------------
       Reading events by followed users
    ------------------------------------------------- */
    const readEvents = await Reading.find({
      userId: { $in: follows },
      updatedAt: { $gte: since },
      status: { $in: ["started", "finished"] },
    })
      .select("userId bookId status updatedAt createdAt")
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    /* -------------------------------------------------
       Batch-fetch actors and books (N+1 FIX)
    ------------------------------------------------- */
    const userIds = new Set();
    const bookIds = new Set();

    reviews.forEach((r) => {
      userIds.add(String(r.userId));
      bookIds.add(String(r.bookId));
    });

    readEvents.forEach((r) => {
      userIds.add(String(r.userId));
      bookIds.add(String(r.bookId));
    });

    const [users, books] = await Promise.all([
      User.find({ _id: { $in: Array.from(userIds) } })
        .select("_id name avatar")
        .lean(),
      Book.find({ _id: { $in: Array.from(bookIds) } })
        .select("title authors coverUrl avgRating")
        .lean(),
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const bookMap = new Map(books.map((b) => [String(b._id), b]));

    /* -------------------------------------------------
       Normalize review items
    ------------------------------------------------- */
    const reviewItems = reviews.map((r) => ({
      type: "following",
      action: "review",
      createdAt: r.createdAt,
      book: bookMap.get(String(r.bookId)) || null,
      actor: userMap.get(String(r.userId)) || null,
      review: {
        rating: r.rating,
        excerpt: (r.content || "").slice(0, 300),
      },
      score: 0.9, // social reviews are high-signal
    }));

    /* -------------------------------------------------
       Normalize reading items
    ------------------------------------------------- */
    const readItems = readEvents.map((r) => ({
      type: "following",
      action: r.status === "started" ? "started" : "finished",
      createdAt: r.updatedAt || r.createdAt,
      book: bookMap.get(String(r.bookId)) || null,
      actor: userMap.get(String(r.userId)) || null,
      score: r.status === "finished" ? 0.75 : 0.6,
    }));

    /* -------------------------------------------------
       Merge, sort, and limit
    ------------------------------------------------- */
    return [...reviewItems, ...readItems]
      .filter((i) => i.book && i.actor)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  },
};
