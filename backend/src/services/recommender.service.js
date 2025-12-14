// backend/src/services/recommender.service.js
// ESM, uses your Review/Reading/Shelf models and returns items: { book, score, reason, createdAt }

import mongoose from "mongoose";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";

const DEFAULT_LIMIT = 50;
const RECENT_WINDOW_DAYS = 180;

function daysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

/* -------------------------
   USER INTERACTIONS
------------------------- */
async function getUserInteractions(userId) {
  if (!userId)
    return {
      reviewed: [],
      readings: [],
      shelfItems: [],
      interactedBookIds: [],
    };

  const reviewed = await Review.find({ user: userId })
    .select("book createdAt rating")
    .lean();

  let readings = [];
  try {
    readings = await Reading.find({ user: userId })
      .select("book status updatedAt createdAt")
      .lean();
  } catch {}

  const shelves = await Shelf.find({ user: userId }).select("_id").lean();
  const shelfIds = shelves.map((s) => s._id);

  let shelfItems = [];
  if (shelfIds.length) {
    shelfItems = await ShelfItem.find({ shelf: { $in: shelfIds } })
      .select("book createdAt")
      .lean();
  }

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

/* -------------------------
   SIMILAR USERS
------------------------- */
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

/* -------------------------
   CANDIDATE COLLECTION
------------------------- */
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

function scoreCandidate(c) {
  const freq = Math.min(1, c.count / 10);
  const rating = Math.min(1, (c.avgRating || 0) / 5);
  return 0.7 * freq + 0.3 * rating;
}

/* -------------------------
   MAIN API
------------------------- */
async function getPersonalizedPicks(userId, limit = DEFAULT_LIMIT) {
  if (!userId) return [];

  const { interactedBookIds } = await getUserInteractions(userId);

  /* 🧊 Cold start */
  if (!interactedBookIds.length) {
    const books = await Book.find({})
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

  if (!similarUsers.length) {
    const fallback = await Book.find({ _id: { $nin: interactedBookIds } })
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

export default { getPersonalizedPicks };
export { getPersonalizedPicks };
