// backend/src/services/recommender.service.js
// ESM, uses your Review/Reading/Shelf models and returns items: { book, score, reason, createdAt }

import mongoose from "mongoose";
import Book from "../models/Book.js";
import User from "../models/User.js";
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

/**
 * Gather books the user has interacted with: reviewed, reading entries, shelf items.
 * Returns:
 * { reviewed: [...reviews], readings: [...readings], shelfItems: [...], interactedBookIds: [idStrings] }
 */
async function getUserInteractions(userId) {
  if (!userId)
    return {
      reviewed: [],
      readings: [],
      shelfItems: [],
      interactedBookIds: [],
    };

  // Reviews (your schema: user, book)
  const reviewed = await Review.find({ user: userId })
    .select("book createdAt rating")
    .lean();

  // Readings (may exist)
  let readings = [];
  try {
    readings = await Reading.find({ user: userId })
      .select("book status updatedAt createdAt")
      .lean();
  } catch (e) {
    readings = [];
  }

  // Shelves -> shelf items
  const shelves = await Shelf.find({ user: userId }).select("_id").lean();
  const shelfIds = (shelves || []).map((s) => s._id);
  let shelfItems = [];
  if (shelfIds.length) {
    shelfItems = await ShelfItem.find({ shelf: { $in: shelfIds } })
      .select("book createdAt")
      .lean();
  }

  const set = new Set();
  reviewed.forEach((r) => r.book && set.add(String(r.book)));
  readings.forEach((r) => r.book && set.add(String(r.book)));
  shelfItems.forEach((si) => si.book && set.add(String(si.book)));

  return {
    reviewed,
    readings,
    shelfItems,
    interactedBookIds: Array.from(set),
  };
}

/**
 * Find similar users who reviewed the same seed books recently.
 * Returns array of userIds (strings) excluding excludeUserId.
 */
async function getSimilarUsers(seedBookIds, excludeUserId, limit = 200) {
  if (!seedBookIds || seedBookIds.length === 0) return [];

  const since = daysAgoDate(RECENT_WINDOW_DAYS);
  // Use Review collection: fields are { user, book, createdAt }
  const pipeline = [
    {
      $match: {
        book: {
          $in: seedBookIds.map((id) => new mongoose.Types.ObjectId(String(id))),
        },
        createdAt: { $gte: since },
      },
    },
    { $group: { _id: "$user", commonCount: { $sum: 1 } } },
    { $sort: { commonCount: -1 } },
    { $limit: limit },
    { $project: { userId: "$_id", commonCount: 1, _id: 0 } },
  ];

  const rows = await Review.aggregate(pipeline).exec();
  const userIds = rows
    .map((r) => String(r.userId))
    .filter((uid) => uid !== String(excludeUserId));
  return userIds;
}

/**
 * Collect candidate books from similar users (recent reviews + readings).
 * Returns array of candidates { bookId, count, ratingSum, lastInteraction } sorted by count desc.
 */
async function collectCandidateBooks(similarUserIds, excludeBookIds) {
  if (!similarUserIds || similarUserIds.length === 0) return [];

  const since = daysAgoDate(RECENT_WINDOW_DAYS);
  const candCounts = new Map();

  // Reviews by similar users
  const revs = await Review.find({
    user: {
      $in: similarUserIds.map((id) => new mongoose.Types.ObjectId(String(id))),
    },
    createdAt: { $gte: since },
  })
    .select("book rating createdAt user")
    .lean();

  for (const r of revs) {
    const bookId = String(r.book);
    if (excludeBookIds.includes(bookId)) continue;
    const entry = candCounts.get(bookId) || {
      count: 0,
      ratingSum: 0,
      lastInteraction: new Date(0),
    };
    entry.count += 1;
    entry.ratingSum += typeof r.rating === "number" ? r.rating : 0;
    const t = r.createdAt || new Date();
    if (t > entry.lastInteraction) entry.lastInteraction = t;
    candCounts.set(bookId, entry);
  }

  // Readings by similar users (if Reading exists)
  try {
    const reads = await Reading.find({
      user: {
        $in: similarUserIds.map(
          (id) => new mongoose.Types.ObjectId(String(id))
        ),
      },
      updatedAt: { $gte: since },
    })
      .select("book updatedAt createdAt")
      .lean();

    for (const r of reads) {
      const bookId = String(r.book);
      if (excludeBookIds.includes(bookId)) continue;
      const entry = candCounts.get(bookId) || {
        count: 0,
        ratingSum: 0,
        lastInteraction: new Date(0),
      };
      entry.count += 0.6; // reading weighs less than review
      const t = r.updatedAt || r.createdAt || new Date();
      if (t > entry.lastInteraction) entry.lastInteraction = t;
      candCounts.set(bookId, entry);
    }
  } catch (e) {
    // ignore if Reading not present
  }

  const cands = Array.from(candCounts.entries()).map(([bookId, v]) => ({
    bookId,
    count: v.count,
    avgRating: v.ratingSum / Math.max(1, v.count),
    lastInteraction: v.lastInteraction,
  }));

  cands.sort((a, b) => b.count - a.count);
  return cands;
}

function scoreCandidate(candidate) {
  const freq = Math.min(1, candidate.count / 10);
  const rating = Math.min(1, (candidate.avgRating || 0) / 5);
  const recencyHours =
    (Date.now() - new Date(candidate.lastInteraction).getTime()) /
    (1000 * 60 * 60);
  const recency = Math.max(0, 1 - recencyHours / (24 * 90));
  return 0.55 * freq + 0.3 * rating + 0.15 * recency;
}

/**
 * getPersonalizedPicks(userId, limit)
 * returns array of { book, score, reason, createdAt }
 */
async function getPersonalizedPicks(userId, limit = DEFAULT_LIMIT) {
  if (!userId) return [];

  const { interactedBookIds, reviewed, readings, shelfItems } =
    await getUserInteractions(userId);

  // fallback if no history
  if (!interactedBookIds || interactedBookIds.length === 0) {
    const popular = await Book.find({})
      .sort({ avgRating: -1 })
      .limit(limit)
      .lean();
    return popular.map((b) => ({
      book: b,
      score: (b.avgRating || 0) / 5,
      reason: "popular_fallback",
      createdAt: b.updatedAt || b.createdAt || new Date(),
    }));
  }

  const seedBookIds = interactedBookIds.slice(0, 20);

  const similarUserIds = await getSimilarUsers(seedBookIds, userId, 500);
  if (!similarUserIds.length) {
    // fallback
    const fallback = await Book.find({ _id: { $nin: interactedBookIds } })
      .limit(limit)
      .lean();
    return fallback.map((b) => ({
      book: b,
      score: (b.avgRating || 0) / 5,
      reason: "fallback_popular",
      createdAt: b.updatedAt || b.createdAt || new Date(),
    }));
  }

  const candidates = await collectCandidateBooks(
    similarUserIds,
    interactedBookIds
  );
  if (!candidates.length) {
    const fallback = await Book.find({ _id: { $nin: interactedBookIds } })
      .limit(limit)
      .lean();
    return fallback.map((b) => ({
      book: b,
      score: (b.avgRating || 0) / 5,
      reason: "fallback_popular",
      createdAt: b.updatedAt || b.createdAt || new Date(),
    }));
  }

  const bookIds = candidates.map((c) => new mongoose.Types.ObjectId(c.bookId));
  const books = await Book.find({ _id: { $in: bookIds } })
    .select(
      "title authors cover externalId avgRating genres updatedAt createdAt"
    )
    .lean();
  const bookMap = new Map(books.map((b) => [String(b._id), b]));

  const scored = candidates
    .map((c) => {
      const book = bookMap.get(c.bookId);
      if (!book) return null;
      const score = scoreCandidate(c);
      const reason = `cf_cooccur:${Math.round(c.count)}`;
      const createdAt =
        book.updatedAt || book.createdAt || c.lastInteraction || new Date();
      return { book, score, reason, createdAt };
    })
    .filter(Boolean);

  scored.sort(
    (a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt)
  );
  return scored.slice(0, limit);
}

// optional: simple taste vector (genre distribution)
async function getUserTasteVector(userId) {
  const { interactedBookIds } = await getUserInteractions(userId);
  if (!interactedBookIds.length) return {};
  const books = await Book.find({ _id: { $in: interactedBookIds } })
    .select("genres")
    .lean();
  const counts = {};
  for (const b of books) {
    const genres = b.genres || [];
    genres.forEach((g) => (counts[g] = (counts[g] || 0) + 1));
  }
  const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
  const vector = {};
  for (const k of Object.keys(counts)) vector[k] = counts[k] / total;
  return vector;
}

export default { getPersonalizedPicks, getUserTasteVector };
export { getPersonalizedPicks, getUserTasteVector };
