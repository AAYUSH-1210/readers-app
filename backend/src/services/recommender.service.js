// backend/src/services/recommender.service.js
// Simple recommender service (fallback / standalone).
// Exports: default { getPersonalizedPicks, getUserTasteVector }
// and named export getPersonalizedPicks for backward compatibility.

import Book from "../models/Book.js";
import User from "../models/User.js";
import Review from "../models/Review.js";
import Reading from "../models/Reading.js"; // optional, if present
import mongoose from "mongoose";

/**
 * High-level strategy (simple, fast, no external embeddings):
 * 1) Gather user's shelves + recent reviews => seed books + genres.
 * 2) Find other users who interacted with those seed books (collaborative filtering).
 * 3) Collect candidate books those users interacted with, filter out books user already read/shelved.
 * 4) Rank candidates by a combined score:
 *    - frequency among similar users (co-occurrence)
 *    - avg rating
 *    - recency signal (prefers more recent interactions)
 *
 * This returns items: [{ book, score, reason, createdAt }]
 *
 * NOTE: This is intentionally simple and fast. Replace / augment with your ML-based recommender later.
 */

const DEFAULT_LIMIT = 50;
const RECENT_WINDOW_DAYS = 180;

function daysAgoDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function getUserInteractions(userId) {
  // returns set of bookIds the user has interacted with (shelved/read/reviewed)
  // adapt this if your schema stores shelves elsewhere
  const reviewed = await Review.find({ userId })
    .select("bookId createdAt")
    .lean();
  // readings may not exist in your project
  let readings = [];
  try {
    readings = await Reading.find({ userId })
      .select("bookId status updatedAt createdAt")
      .lean();
  } catch (e) {
    readings = [];
  }
  // user model may include shelves as array of bookIds
  const me = await User.findById(userId).select("shelves").lean();

  const set = new Set();
  reviewed.forEach((r) => set.add(r.bookId.toString()));
  readings.forEach((r) => set.add(r.bookId.toString()));
  if (me && me.shelves && Array.isArray(me.shelves)) {
    me.shelves.forEach((s) => {
      if (typeof s === "object" && s.bookId) set.add(String(s.bookId));
      else set.add(String(s));
    });
  }

  return {
    reviewed,
    readings,
    shelves: me?.shelves || [],
    interactedBookIds: Array.from(set),
  };
}

async function getSimilarUsers(seedBookIds, excludeUserId, limit = 200) {
  // find users who reviewed/read seed books recently
  const since = daysAgoDate(RECENT_WINDOW_DAYS);

  const pipeline = [
    {
      $match: {
        bookId: { $in: seedBookIds.map((id) => mongoose.Types.ObjectId(id)) },
        createdAt: { $gte: since },
      },
    },
    { $group: { _id: "$userId", commonCount: { $sum: 1 } } },
    { $sort: { commonCount: -1 } },
    { $limit: limit },
    { $project: { userId: "$_id", commonCount: 1, _id: 0 } },
  ];

  const rows = await Review.aggregate(pipeline).exec();
  const userIds = rows
    .map((r) => r.userId.toString())
    .filter((uid) => uid !== String(excludeUserId));
  return userIds;
}

async function collectCandidateBooks(
  similarUserIds,
  excludeBookIds,
  limitPerUser = 20
) {
  // For each similar user, gather their recent reviewed / read books and aggregate counts
  const since = daysAgoDate(RECENT_WINDOW_DAYS);
  const candCounts = new Map(); // bookId -> { count, avgRatingSum, lastInteraction }

  // find reviews by these users
  const reviews = await Review.find({
    userId: { $in: similarUserIds.map((id) => mongoose.Types.ObjectId(id)) },
    createdAt: { $gte: since },
  })
    .select("bookId rating createdAt userId")
    .lean();

  for (const r of reviews) {
    const bookId = String(r.bookId);
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

  // Optionally include readings (if Reading model exists)
  try {
    const readings = await Reading.find({
      userId: { $in: similarUserIds.map((id) => mongoose.Types.ObjectId(id)) },
      updatedAt: { $gte: since },
    })
      .select("bookId status updatedAt")
      .lean();

    for (const r of readings) {
      const bookId = String(r.bookId);
      if (excludeBookIds.includes(bookId)) continue;
      const entry = candCounts.get(bookId) || {
        count: 0,
        ratingSum: 0,
        lastInteraction: new Date(0),
      };
      entry.count += 0.6; // reading counts less than review
      const t = r.updatedAt || r.createdAt || new Date();
      if (t > entry.lastInteraction) entry.lastInteraction = t;
      candCounts.set(bookId, entry);
    }
  } catch (e) {
    // ignore if Reading model not available
  }

  // Convert to array and enrich with book details
  const cands = Array.from(candCounts.entries()).map(([bookId, v]) => ({
    bookId,
    count: v.count,
    avgRating: v.ratingSum / Math.max(1, v.count),
    lastInteraction: v.lastInteraction,
  }));

  // sort by count desc and return top N (we'll fetch book docs)
  cands.sort((a, b) => b.count - a.count);
  return cands.slice(0, 500); // return a reasonably large candidate list
}

function scoreCandidate(candidate) {
  // candidate: { count, avgRating, lastInteraction }
  // compute a heuristic score in [0,1]
  const freq = Math.min(1, candidate.count / 10); // 10 co-occurrences -> freq=1
  const rating = Math.min(1, (candidate.avgRating || 0) / 5);
  const recencyHours =
    (Date.now() - new Date(candidate.lastInteraction).getTime()) /
    (1000 * 60 * 60);
  const recency = Math.max(0, 1 - recencyHours / (24 * 90)); // decays over ~90 days

  // weights: freq 0.55, rating 0.30, recency 0.15
  return 0.55 * freq + 0.3 * rating + 0.15 * recency;
}

/**
 * Public: getPersonalizedPicks(userId, limit)
 * Returns array of { book, score, reason, createdAt }
 */
async function getPersonalizedPicks(userId, limit = DEFAULT_LIMIT) {
  if (!userId) return [];

  // 1) user interactions
  const { interactedBookIds, reviewed, readings, shelves } =
    await getUserInteractions(userId);

  // If user has very little history, fallback to popular books (popular by avg rating + reviews)
  if (interactedBookIds.length === 0) {
    // fallback: top-rated, recent books
    const popular = await Book.find({})
      .sort({ avgRating: -1, ratingsCount: -1 })
      .limit(limit)
      .lean();
    return popular.map((b) => ({
      book: b,
      score: (b.avgRating || 0) / 5,
      reason: "popular_fallback",
      createdAt: b.updatedAt || b.createdAt || new Date(),
    }));
  }

  // 2) Seed books for similarity (use most recent / highest rated from the user)
  const seedBookIds = interactedBookIds.slice(0, 20); // limit seed size

  // 3) Find similar users
  const similarUserIds = await getSimilarUsers(seedBookIds, userId, 500);

  // 4) Collect candidate books from those users
  const candidates = await collectCandidateBooks(
    similarUserIds,
    interactedBookIds,
    20
  );

  if (!candidates.length) {
    // as a fallback return top books excluding interacted
    const fallback = await Book.find({ _id: { $nin: interactedBookIds } })
      .sort({ avgRating: -1, ratingsCount: -1 })
      .limit(limit)
      .lean();
    return fallback.map((b) => ({
      book: b,
      score: (b.avgRating || 0) / 5,
      reason: "fallback_popular",
      createdAt: b.updatedAt || b.createdAt,
    }));
  }

  // 5) Fetch book docs for candidates
  const bookIds = candidates.map((c) => mongoose.Types.ObjectId(c.bookId));
  const books = await Book.find({ _id: { $in: bookIds } })
    .select("title authors coverUrl avgRating genres updatedAt createdAt")
    .lean();

  const bookMap = new Map(books.map((b) => [String(b._id), b]));

  // 6) Build scored list
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

  // 7) Sort and limit
  scored.sort(
    (a, b) => b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt)
  );
  return scored.slice(0, limit);
}

// optional export for taste vector - simple genre weight vector
async function getUserTasteVector(userId) {
  // compute frequency of genres from user's interacted books
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
  // normalize
  const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
  const vector = {};
  for (const k of Object.keys(counts)) vector[k] = counts[k] / total;
  return vector;
}

export default { getPersonalizedPicks, getUserTasteVector };
export { getPersonalizedPicks, getUserTasteVector };
