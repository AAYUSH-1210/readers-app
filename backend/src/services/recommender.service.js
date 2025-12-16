// backend/src/services/recommender.service.js
// Collaborative recommendation service.
//
// Strategy (MVP-friendly user-based CF):
// 1) Collect a user's interaction history (reviews, readings, shelves)
// 2) Find similar users based on overlapping reviewed books (recent window)
// 3) Collect candidate books those users interacted with
// 4) Score candidates using frequency + average rating
// 5) Apply cold-start and fallback strategies when signals are weak
//
// Design principles:
// - Favor recent interactions (bounded time window)
// - Be resilient to missing or partial data
// - Avoid breaking feed composition on failures
// - Keep scoring simple and interpretable

import mongoose from "mongoose";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";

const DEFAULT_LIMIT = 50;
const RECENT_WINDOW_DAYS = 180;

/**
 * Utility: date N days ago
 */
function daysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/* -------------------------------------------------
   USER INTERACTIONS
------------------------------------------------- */
/**
 * Collects all book interaction signals for a user.
 * Returns both raw interaction lists and a deduplicated
 * list of interacted bookIds.
 */
async function getUserInteractions(userId) {
  if (!userId) {
    return {
      reviewed: [],
      readings: [],
      shelfItems: [],
      interactedBookIds: [],
    };
  }

  // Reviews are the strongest signal
  const reviewed = await Review.find({ user: userId })
    .select("book createdAt rating")
    .lean();

  // Reading status is a softer signal; failures are non-fatal
  let readings = [];
  try {
    readings = await Reading.find({ user: userId })
      .select("book status updatedAt createdAt")
      .lean();
  } catch {
    // intentionally ignored (optional signal)
  }

  // Shelf membership is a weak but useful intent signal
  const shelves = await Shelf.find({ user: userId }).select("_id").lean();

  const shelfIds = shelves.map((s) => s._id);

  let shelfItems = [];
  if (shelfIds.length) {
    shelfItems = await ShelfItem.find({
      shelf: { $in: shelfIds },
    })
      .select("book createdAt")
      .lean();
  }

  // Deduplicate interacted book ids
  const set = new Set();
  reviewed.forEach((r) => r.book && set.add(String(r.book)));
  readings.forEach((r) => r.book && set.add(String(r.book)));
  shelfItems.forEach((s) => s.book && set.add(String(s.book)));

  return {
    reviewed,
    readings,
    shelfItems,
    interactedBookIds: Array.from(set),
  };
}

/* -------------------------------------------------
   SIMILAR USERS
------------------------------------------------- */
/**
 * Finds users who reviewed the same books as the seed user
 * within a recent time window.
 */
async function getSimilarUsers(seedBookIds, excludeUserId, limit = 200) {
  if (!seedBookIds.length) return [];

  const since = daysAgoDate(RECENT_WINDOW_DAYS);

  const rows = await Review.aggregate([
    {
      $match: {
        book: {
          $in: seedBookIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
        createdAt: { $gte: since },
      },
    },
    { $group: { _id: "$user", commonCount: { $sum: 1 } } },
    { $sort: { commonCount: -1 } },
    { $limit: limit },
  ]);

  return rows
    .map((r) => String(r._id))
    .filter((id) => id !== String(excludeUserId));
}

/* -------------------------------------------------
   CANDIDATE COLLECTION
------------------------------------------------- */
/**
 * Collects candidate books from similar users' recent reviews.
 * Aggregates frequency, average rating, and recency.
 */
async function collectCandidateBooks(similarUserIds, excludeBookIds) {
  if (!similarUserIds.length) return [];

  const since = daysAgoDate(RECENT_WINDOW_DAYS);
  const map = new Map();

  const reviews = await Review.find({
    user: { $in: similarUserIds },
    createdAt: { $gte: since },
  })
    .select("book rating createdAt")
    .lean();

  for (const r of reviews) {
    const id = String(r.book);
    if (excludeBookIds.includes(id)) continue;

    const entry = map.get(id) || {
      count: 0,
      ratingSum: 0,
      lastInteraction: new Date(0),
    };

    entry.count += 1;
    entry.ratingSum += r.rating || 0;
    entry.lastInteraction =
      r.createdAt > entry.lastInteraction ? r.createdAt : entry.lastInteraction;

    map.set(id, entry);
  }

  return Array.from(map.entries()).map(([bookId, v]) => ({
    bookId,
    count: v.count,
    avgRating: v.ratingSum / Math.max(1, v.count),
    lastInteraction: v.lastInteraction,
  }));
}

/**
 * Simple candidate scoring:
 * - Frequency dominates
 * - Rating provides secondary boost
 */
function scoreCandidate(c) {
  const freq = Math.min(1, c.count / 10);
  const rating = Math.min(1, (c.avgRating || 0) / 5);
  return 0.7 * freq + 0.3 * rating;
}

/* -------------------------------------------------
   MAIN API
------------------------------------------------- */
/**
 * Returns personalized book recommendations for a user.
 *
 * @param {string|ObjectId} userId
 * @param {number} limit
 * @returns {Array<{book, score, reason, createdAt}>}
 */
async function getPersonalizedPicks(userId, limit = DEFAULT_LIMIT) {
  if (!userId) return [];

  const { interactedBookIds } = await getUserInteractions(userId);

  /* 🧊 Cold start: no interaction history */
  if (!interactedBookIds.length) {
    const books = await Book.find({})
      .select("title authors avgRating createdAt updatedAt cover")
      .sort({ avgRating: -1 })
      .limit(limit)
      .lean();

    return books.map((b) => ({
      book: b,
      score: (b.avgRating || 0) / 5,
      reason: "Popular among readers like you",
      createdAt: b.updatedAt || b.createdAt,
    }));
  }

  const similarUsers = await getSimilarUsers(
    interactedBookIds.slice(0, 20),
    userId
  );

  /* Fallback: user has history but no similar users */
  if (!similarUsers.length) {
    const fallback = await Book.find({
      _id: { $nin: interactedBookIds },
    })
      .limit(limit)
      .lean();

    return fallback.map((b) => ({
      book: b,
      score: (b.avgRating || 0) / 5,
      reason: "Recommended because you enjoyed similar books",
      createdAt: b.updatedAt || b.createdAt,
    }));
  }

  const candidates = await collectCandidateBooks(
    similarUsers,
    interactedBookIds
  );

  const books = await Book.find({
    _id: { $in: candidates.map((c) => c.bookId) },
  }).lean();

  const map = new Map(books.map((b) => [String(b._id), b]));

  return candidates
    .map((c) => {
      const book = map.get(c.bookId);
      if (!book) return null;

      return {
        book,
        score: scoreCandidate(c),
        reason: "Readers with similar taste also liked this",
        createdAt: book.updatedAt || book.createdAt,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Dual export is intentional:
// - default import for services
// - named import for tests / utilities
export default { getPersonalizedPicks };
export { getPersonalizedPicks };
