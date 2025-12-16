// backend/src/utils/recommender.js
// Hybrid recommendation utilities.
// Implements content-based similarity, collaborative filtering,
// user taste vector recommendations, and cold-start fallbacks.
//
// Design goals:
// - Always return something useful
// - Be defensive against missing data
// - Keep DB operations bounded
// - Avoid breaking user experience on partial failures

import mongoose from "mongoose";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import ReadingList from "../models/Reading.js";

import { getEmbeddingForText, findSimilarByEmbedding } from "./embeddings.js";

import { computeUserTasteVector } from "./userTasteVector.js";

/**
 * Fetch Book documents by ids while preserving input order.
 * Accepts mixed ObjectId / string ids.
 */
export async function fetchBooksByIds(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const objectIds = ids
    .map((id) =>
      mongoose.Types.ObjectId.isValid(id)
        ? new mongoose.Types.ObjectId(id)
        : null
    )
    .filter(Boolean);

  if (!objectIds.length) return [];

  const books = await Book.find({ _id: { $in: objectIds } }).lean();
  const byId = new Map(books.map((b) => [String(b._id), b]));

  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/* ---------------------------------------------------------
   Content-based similarity
   ---------------------------------------------------------
   Uses stored book embeddings when available.
   Falls back to text-based embeddings otherwise.
*/
export async function contentBasedSimilar(bookId, { limit = 12 } = {}) {
  if (!bookId) return [];

  const book = await Book.findById(bookId).lean();
  if (!book) return [];

  let vec = null;

  if (Array.isArray(book.embedding) && book.embedding.length) {
    vec = book.embedding;
  } else {
    const text = `${book.title || ""} ${book.subtitle || ""} ${
      book.description || ""
    }`.slice(0, 2000);

    vec = await getEmbeddingForText(text);
  }

  if (!vec) return [];

  // Over-fetch neighbors to allow filtering & deduplication
  const neighbors = await findSimilarByEmbedding(vec, {
    topK: Math.max(limit * 4, 50),
  });

  if (!neighbors.length) return [];

  const ids = [];
  const scores = new Map();
  const seen = new Set([String(book._id)]);

  for (const n of neighbors) {
    const id = n.bookId || n.id || n._id;
    if (!id) continue;
    const sid = String(id);
    if (seen.has(sid)) continue;

    seen.add(sid);
    ids.push(sid);
    scores.set(sid, n.score ?? n.similarity ?? 0);

    if (ids.length >= limit) break;
  }

  const books = await fetchBooksByIds(ids);

  return books.map((b) => ({
    ...b,
    _score: scores.get(String(b._id)) || 0,
  }));
}

/* ---------------------------------------------------------
   Collaborative filtering (co-read / co-review)
   ---------------------------------------------------------
   Simple item-item collaborative strategy.
*/
export async function collaborativeSimilar(bookId, { limit = 12 } = {}) {
  if (!bookId) return [];

  // Users who interacted with this book
  const readers = await ReadingList.find({ book: bookId })
    .select("user")
    .lean();

  const reviewers = await Review.find({ book: bookId }).select("user").lean();

  const userIds = new Set();
  readers.forEach((r) => r.user && userIds.add(String(r.user)));
  reviewers.forEach((r) => r.user && userIds.add(String(r.user)));

  if (!userIds.size) return [];

  const users = Array.from(userIds)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id))
    .slice(0, 2000); // hard cap for safety

  // Aggregate reading co-occurrence
  const readAgg = await ReadingList.aggregate([
    {
      $match: {
        user: { $in: users },
        book: { $ne: new mongoose.Types.ObjectId(bookId) },
      },
    },
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit * 10 },
  ]);

  // Aggregate reviews (count + avg rating)
  const reviewAgg = await Review.aggregate([
    {
      $match: {
        user: { $in: users },
        book: { $ne: new mongoose.Types.ObjectId(bookId) },
      },
    },
    {
      $group: {
        _id: "$book",
        reviewCount: { $sum: 1 },
        avgRating: { $avg: "$rating" },
      },
    },
    { $sort: { reviewCount: -1 } },
    { $limit: limit * 10 },
  ]);

  // Combine scores
  const scoreMap = new Map();

  for (const r of readAgg) {
    scoreMap.set(
      String(r._id),
      (scoreMap.get(String(r._id)) || 0) + (r.count || 0)
    );
  }

  for (const r of reviewAgg) {
    const bonus =
      (r.reviewCount || 0) * 1.5 + (r.avgRating ? (r.avgRating - 3) * 0.5 : 0);

    scoreMap.set(String(r._id), (scoreMap.get(String(r._id)) || 0) + bonus);
  }

  const scored = Array.from(scoreMap.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2);

  const books = await fetchBooksByIds(scored.map((s) => s.id));
  const byId = new Map(books.map((b) => [String(b._id), b]));

  const out = [];
  for (const s of scored) {
    const b = byId.get(String(s.id));
    if (!b) continue;
    out.push({ ...b, _score: s.score });
    if (out.length >= limit) break;
  }

  return out;
}

/* ---------------------------------------------------------
   recommendForUser
   ---------------------------------------------------------
   Main hybrid recommendation pipeline.
*/
export async function recommendForUser(
  userId,
  { seedBookId = null, limit = 20 } = {}
) {
  if (!userId) return [];

  let tasteVec = null;
  try {
    tasteVec = await computeUserTasteVector(userId);
  } catch (e) {
    console.warn("computeUserTasteVector failed:", e.message);
  }

  const resultsMap = new Map();

  function pushCandidate(book, score, source) {
    if (!book || !book._id) return;
    const id = String(book._id);

    if (!resultsMap.has(id)) {
      resultsMap.set(id, {
        book,
        score,
        sources: new Set([source]),
      });
    } else {
      const obj = resultsMap.get(id);
      obj.score += score;
      obj.sources.add(source);
    }
  }

  // Seed-based recommendations
  if (seedBookId) {
    const content = await contentBasedSimilar(seedBookId, {
      limit: Math.ceil(limit * 0.8),
    });
    content.forEach((b) => pushCandidate(b, b._score ?? 1.0, "seed_content"));

    const collab = await collaborativeSimilar(seedBookId, {
      limit: Math.ceil(limit * 0.6),
    });
    collab.forEach((b) => pushCandidate(b, b._score ?? 0.8, "seed_collab"));
  }

  // Taste-vector recommendations
  if (tasteVec) {
    const neighbors = await findSimilarByEmbedding(tasteVec, {
      topK: Math.max(80, limit * 4),
    });

    const ids = neighbors.map((n) => n.bookId || n.id || n._id).filter(Boolean);

    const books = await fetchBooksByIds(ids);

    const byId = new Map(
      neighbors.map((n) => [
        String(n.bookId || n.id || n._id),
        n.score ?? n.similarity ?? 0,
      ])
    );

    books.forEach((b) =>
      pushCandidate(b, (byId.get(String(b._id)) || 0) * 1.5, "taste_vec")
    );
  }

  // Cold-start fallback
  if (!tasteVec && !seedBookId) {
    const popular = await popularBooks({
      limit: Math.max(limit, 40),
    });
    popular.forEach((p) => pushCandidate(p, 0.8, "popular_cold"));
  }

  // Collaborative augmentation
  const topSeeds = Array.from(resultsMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  for (const t of topSeeds) {
    const collab = await collaborativeSimilar(t.book._id, { limit: 6 });
    collab.forEach((b) =>
      pushCandidate(b, (b._score ?? 0.6) * 0.6, "augment_collab")
    );
  }

  // Remove books user already has
  const userReads = await ReadingList.find({ user: userId })
    .select("book")
    .lean();

  const owned = new Set(userReads.map((r) => String(r.book)));

  return Array.from(resultsMap.values())
    .filter((r) => !owned.has(String(r.book._id)))
    .map((r) => ({
      book: r.book,
      score: r.score,
      sources: Array.from(r.sources),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ---------------------------------------------------------
   popularBooks
   ---------------------------------------------------------
   Simple popularity fallback.
*/
export async function popularBooks({ limit = 20, daysWindow = 30 } = {}) {
  if (Book.schema.path("popularity")) {
    return Book.find().sort({ popularity: -1 }).limit(limit).lean();
  }

  const since = new Date();
  since.setDate(since.getDate() - daysWindow);

  const agg = await Review.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: "$book",
        recentCount: { $sum: 1 },
        avgRating: { $avg: "$rating" },
      },
    },
    { $sort: { recentCount: -1, avgRating: -1 } },
    { $limit: limit * 3 },
  ]);

  const ids = agg.map((a) => a._id);
  const books = await fetchBooksByIds(ids);
  const byId = new Map(agg.map((a) => [String(a._id), a]));

  return books
    .map((b) => {
      const a = byId.get(String(b._id));
      return {
        ...b,
        _score: (a?.recentCount || 0) * Math.log(1 + (a?.avgRating || 0)),
      };
    })
    .slice(0, limit);
}
