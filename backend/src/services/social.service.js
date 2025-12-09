// backend/src/services/social.service.js
import User from "../models/User.js";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js";
import Book from "../models/Book.js";

/**
 * Returns recent activities from users that `userId` follows.
 * Each item: { book, actor: {id,name,avatar}, action: 'review'|'started'|'finished'|'shelf', createdAt, score? }
 */
export default {
  async getFollowedUsersUpdates(userId, limit = 100, sinceDate = null) {
    // get list of following user ids
    const me = await User.findById(userId).select("following").lean();
    const follows =
      me && me.following ? me.following.map((f) => f.toString()) : [];
    if (!follows.length) return [];

    const since = sinceDate
      ? new Date(sinceDate)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default 7 days

    // 1) Recent reviews by followed users
    const reviews = await Review.find({
      userId: { $in: follows },
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    // map reviews to feed items
    const reviewItems = await Promise.all(
      reviews.map(async (r) => {
        const book = await Book.findById(r.bookId)
          .select("title authors coverUrl avgRating")
          .lean();
        const actor = await User.findById(r.userId)
          .select("_id name avatar")
          .lean();
        return {
          type: "following",
          action: "review",
          createdAt: r.createdAt,
          book,
          actor,
          review: {
            rating: r.rating,
            excerpt: (r.content || "").slice(0, 300),
          },
          score: 0.9, // social updates get a high base score
        };
      })
    );

    // 2) Reading events (started/finished)
    const readEvents = await Reading.find({
      userId: { $in: follows },
      updatedAt: { $gte: since },
      status: { $in: ["started", "finished"] },
    })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const readItems = await Promise.all(
      readEvents.map(async (r) => {
        const book = await Book.findById(r.bookId)
          .select("title authors coverUrl avgRating")
          .lean();
        const actor = await User.findById(r.userId)
          .select("_id name avatar")
          .lean();
        return {
          type: "following",
          action: r.status === "started" ? "started" : "finished",
          createdAt: r.updatedAt || r.createdAt,
          book,
          actor,
          score: r.status === "finished" ? 0.75 : 0.6,
        };
      })
    );

    // Combine and limit to `limit`
    const items = [...reviewItems, ...readItems]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    return items;
  },
};
