// backend/src/utils/recommender.js
// Node ESM
import mongoose from "mongoose";
import Book from "../models/Book.js";
import Review from "../models/Review.js";
import ReadingList from "../models/Reading.js";
import User from "../models/User.js";

import {
  getEmbeddingForText,
  findSimilarByEmbedding,
  normalizeVector,
  cosineSimilarity,
} from "./embeddings.js"; // adjust path if needed

// Optional: if you implemented computeUserTasteVector earlier, use it
import { computeUserTasteVector } from "./userTasteVector.js";

/**
 * Helper: fetch Book docs by ids (preserves order of ids passed)
 * Accepts mixed ObjectId/string array.
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

  const books = await Book.find({ _id: { $in: objectIds } }).lean();
  const byId = new Map(books.map((b) => [String(b._id), b]));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
}

/* -------------------------
   Content-based similar
   -------------------------
   We prefer using stored book.embedding if available.
   If not, compute embedding from title + description.
   Use your vector index via findSimilarByEmbedding(vector, { topK }).
*/
export async function contentBasedSimilar(bookId, { limit = 12 } = {}) {
  if (!bookId) return [];
  const book = await Book.findById(bookId).lean();
  if (!book) return [];

  let vec = null;
  if (
    book.embedding &&
    book.embedding.length &&
    typeof book.embedding[0] === "number"
  ) {
    vec = book.embedding;
  } else {
    const text = `${book.title || ""} ${book.subtitle || ""} ${
      book.description || ""
    }`.slice(0, 2000);
    vec = await getEmbeddingForText(text);
  }
  if (!vec) return [];

  // findSimilarByEmbedding should return [{ bookId, score }]
  const neighbors = await findSimilarByEmbedding(vec, {
    topK: Math.max(limit * 4, 50),
  });
  if (!neighbors || neighbors.length === 0) return [];

  // map to Book docs; filter out original book
  const filtered = [];
  const seen = new Set([String(book._id)]);
  for (const n of neighbors) {
    const id = n.bookId || n.id || n._id;
    if (!id) continue;
    if (seen.has(String(id))) continue;
    seen.add(String(id));
    const b = await Book.findById(id).lean();
    if (!b) continue;
    filtered.push({ ...b, _score: n.score ?? n.similarity ?? 0 });
    if (filtered.length >= limit) break;
  }
  return filtered;
}

/* -------------------------
   Collaborative similar (co-read / co-review)
   -------------------------
   1) Find users who have read or reviewed the seed book
   2) Collect other books those users have read/reviewed
   3) Score by co-occurrence count and average rating
   This is simple item-item collaborative filtering; good for MVP.
*/
export async function collaborativeSimilar(bookId, { limit = 12 } = {}) {
  if (!bookId) return [];

  // Step 1: users who have this book in reading list (or reviewed it)
  const readers = await ReadingList.find({ book: bookId })
    .select("user")
    .lean();
  const reviewerDocs = await Review.find({ book: bookId })
    .select("user")
    .lean();

  const userIds = new Set();
  readers.forEach((r) => r.user && userIds.add(String(r.user)));
  reviewerDocs.forEach((r) => r.user && userIds.add(String(r.user)));

  if (userIds.size === 0) return [];

  const usersArray = Array.from(userIds).slice(0, 2000); // cap for performance

  // Step 2: find other books these users have in reading list or reviews
  // Aggregate counts from reading list
  const readAgg = await ReadingList.aggregate([
    {
      $match: {
        user: {
          $in: usersArray
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id)),
        },
        book: new mongoose.Types.ObjectId(bookId), // or {$ne: ...} if you really need "not equal"
      },
    },
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit * 10 },
  ]);

  // Aggregate from reviews (count + avg rating)
  const reviewAgg = await Review.aggregate([
    {
      $match: {
        user: {
          $in: usersArray
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id)),
        },
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

  // Score combine: coReadCount * 1.0 + reviewCount * 1.5 + avgRating bonus
  const scoreMap = new Map();

  for (const r of readAgg) {
    const id = String(r._id);
    const prev = scoreMap.get(id) || 0;
    scoreMap.set(id, prev + (r.count || 0) * 1.0);
  }
  for (const r of reviewAgg) {
    const id = String(r._id);
    const prev = scoreMap.get(id) || 0;
    const bonus =
      (r.reviewCount || 0) * 1.5 + (r.avgRating ? (r.avgRating - 3) * 0.5 : 0); // rating centered at 3
    scoreMap.set(id, prev + bonus);
  }

  // Sort by score and pick top N
  const scored = Array.from(scoreMap.entries())
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 2);

  // fetch books and return with score
  const ids = scored.map((s) => s.id);
  const books = await fetchBooksByIds(ids);
  // map to preserve ordering and attach score
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

/* -------------------------
   recommendForUser
   -------------------------
   Strategy:
   1) Try building a user taste vector (embedding of user's reading+reviews+shelves)
   2) Use vector index to get content-based recommendations near taste vector
   3) Augment with collaborative similar from top content neighbors (or optionally seedBook)
   4) Merge & rank (dedupe) and return top `limit`
*/
export async function recommendForUser(
  userId,
  { seedBookId = null, limit = 20 } = {}
) {
  if (!userId) return [];

  // 1) Compute user taste vector (use provided util if available)
  let tasteVec = null;
  try {
    if (typeof computeUserTasteVector === "function") {
      tasteVec = await computeUserTasteVector(userId);
    }
  } catch (err) {
    // swallow and fallback
    console.warn("computeUserTasteVector failed:", err.message);
  }

  // 2) If a seedBookId is provided, prefer seeds (contentBased) + collaborative around seed
  const resultsMap = new Map(); // bookId -> { book, score, sources: [] }

  async function pushCandidate(bookObj, score, source) {
    if (!bookObj || !bookObj._id) return;
    const id = String(bookObj._id);
    const prev = resultsMap.get(id);
    if (prev) {
      prev.score += score;
      prev.sources.add(source);
    } else {
      resultsMap.set(id, {
        book: bookObj,
        score: score,
        sources: new Set([source]),
      });
    }
  }

  // If seed provided -> content + collaborative around seed
  if (seedBookId) {
    const c = await contentBasedSimilar(seedBookId, {
      limit: Math.ceil(limit * 0.8),
    });
    for (const b of c) await pushCandidate(b, b._score ?? 1.0, "seed_content");

    const coll = await collaborativeSimilar(seedBookId, {
      limit: Math.ceil(limit * 0.6),
    });
    for (const b of coll)
      await pushCandidate(b, b._score ?? 0.8, "seed_collab");
  }

  // If we have a taste vector -> query embedding index
  if (tasteVec) {
    const neighbors = await findSimilarByEmbedding(tasteVec, {
      topK: Math.max(80, limit * 4),
    });
    for (const n of neighbors) {
      const id = n.bookId || n.id || n._id;
      if (!id) continue;
      const b = await Book.findById(id).lean();
      if (!b) continue;
      await pushCandidate(b, (n.score ?? n.similarity ?? 0) * 1.5, "taste_vec");
    }
  }

  // Fallback: if no tasteVec and no seed -> use top popular books (cold start)
  if (!tasteVec && !seedBookId) {
    const popular = await popularBooks({ limit: Math.max(limit, 40) });
    for (const p of popular) await pushCandidate(p, 0.8, "popular_cold");
  }

  // Augment: for top candidates, run collaborativeSimilar to boost items that co-occur
  // Pick a small set of current top ids and expand
  const currentTop = Array.from(resultsMap.entries())
    .map(([id, obj]) => ({ id, score: obj.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  for (const t of currentTop) {
    const coll = await collaborativeSimilar(t.id, { limit: 6 });
    for (const b of coll)
      await pushCandidate(b, (b._score ?? 0.6) * 0.6, "augment_collab");
  }

  // Convert map to sorted array, filter out duplicates and items the user already has in reading list
  const userReads = await ReadingList.find({ user: userId })
    .select("book")
    .lean();
  const owned = new Set(userReads.map((r) => String(r.book)));

  const final = Array.from(resultsMap.values())
    .filter((item) => item.book && !owned.has(String(item.book._id)))
    .map((item) => ({
      book: item.book,
      score: item.score,
      sources: Array.from(item.sources),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return final;
}

/* -------------------------
   popularBooks
   -------------------------
   Simple popularity ranking – uses recent review volume + avg rating.
   You can later replace with precomputed book.popularity or a more sophisticated "trending" pipeline
*/
export async function popularBooks({ limit = 20, daysWindow = 30 } = {}) {
  // if Book has popularity field, return by that
  if (Book.schema.path("popularity")) {
    const docs = await Book.find().sort({ popularity: -1 }).limit(limit).lean();
    return docs;
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

  const out = [];
  for (const a of agg) {
    const b = await Book.findById(a._id).lean();
    if (!b) continue;
    b._score = (a.recentCount || 0) * Math.log(1 + (a.avgRating || 0));
    out.push(b);
    if (out.length >= limit) break;
  }

  // If not enough recent trending books, fill with high avg rating books
  if (out.length < limit) {
    const need = limit - out.length;
    const rated = await Review.aggregate([
      {
        $group: {
          _id: "$book",
          avgRating: { $avg: "$rating" },
          cnt: { $sum: 1 },
        },
      },
      { $match: { cnt: { $gte: 3 } } },
      { $sort: { avgRating: -1, cnt: -1 } },
      { $limit: need * 3 },
    ]);
    for (const r of rated) {
      if (out.length >= limit) break;
      const b = await Book.findById(r._id).lean();
      if (!b) continue;
      if (out.find((o) => String(o._id) === String(b._id))) continue;
      b._score = r.avgRating;
      out.push(b);
    }
  }

  return out.slice(0, limit);
}
