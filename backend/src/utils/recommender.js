// backend/src/utils/recommender.js
import mongoose from "mongoose";
import Book from "../models/Book.js";
import Reading from "../models/Reading.js";
import Favorite from "../models/Favorite.js";
import Review from "../models/Review.js";

/**
 * Utility functions to produce recommendations.
 *
 * NOTE: All functions return an array of Book documents (populated minimally).
 * They avoid heavy computation and use aggregation where possible.
 */

/* Helper: fetch books by ids preserving order */
export async function fetchBooksByIds(ids = []) {
  if (!ids || ids.length === 0) return [];
  // Keep order by mapping
  const docs = await Book.find({ _id: { $in: ids } });
  const map = new Map(docs.map((d) => [String(d._id), d]));
  return ids.map((id) => map.get(String(id))).filter(Boolean);
}

/* 1) Popularity-based: top favorited or most-read books */
export async function popularBooks({ limit = 20 } = {}) {
  // Prefer favorites count, fallback to reads
  const favAgg = await Favorite.aggregate([
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  const ids = favAgg.map((r) => r._id).filter(Boolean);
  if (ids.length < limit) {
    // supplement with most-read (by reading entries created)
    const more = await Reading.aggregate([
      { $group: { _id: "$book", reads: { $sum: 1 } } },
      { $sort: { reads: -1 } },
      { $limit: limit * 2 },
    ]);
    for (const r of more) {
      if (!ids.find((x) => String(x) === String(r._id)))
        ids.push(r._1d ?? r._id);
      if (ids.length >= limit) break;
    }
  }

  return fetchBooksByIds(ids.slice(0, limit));
}

/* 2) Content-based: similar by authors and subjects
   For a given bookId (or externalId resolved to id), find other books sharing authors or subjects.
*/
export async function contentBasedSimilar(bookId, { limit = 20 } = {}) {
  if (!bookId) return [];

  const book = await Book.findById(bookId);
  if (!book) return [];

  // gather candidate books by authors or subjects if available
  const authors = (book.authors || []).filter(Boolean);
  const subjects =
    (book.raw && book.raw.subjects) ||
    (book.raw && book.raw.openlibrary && book.raw.openlibrary.subjects) ||
    [];

  const q = {
    _id: { $ne: book._id },
    $or: [],
  };

  if (authors.length) q.$or.push({ authors: { $in: authors } });
  if (subjects && subjects.length)
    q.$or.push(
      { "raw.subjects": { $in: subjects } },
      { "raw.openlibrary.subjects": { $in: subjects } }
    );

  if (q.$or.length === 0) return [];

  const candidates = await Book.find(q).limit(limit * 3);

  // simple scoring: +2 for author match, +1 for subject match
  const scores = candidates.map((c) => {
    let score = 0;
    for (const a of authors) if ((c.authors || []).includes(a)) score += 2;
    const cSubjects =
      (c.raw && (c.raw.subjects || c.raw.openlibrary?.subjects)) || [];
    for (const s of subjects)
      if (cSubjects && cSubjects.includes(s)) score += 1;
    return { book: c, score };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, limit).map((s) => s.book);
}

/* 3) Collaborative: item-to-item via co-occurrence in users' favorites/reading lists
   Simple approach:
   - Find all users who have the seed book in Reading or Favorite
   - Find other books these users have in Reading/Favorite
   - Rank by co-occurrence count
*/
export async function collaborativeSimilar(bookId, { limit = 20 } = {}) {
  if (!bookId) return [];

  const bookObjId = new mongoose.Types.ObjectId(bookId);

  // get users who interacted with the book (reading or favorite)
  const users1 = await Reading.distinct("user", { book: bookObjId });
  const users2 = await Favorite.distinct("user", { book: bookObjId });
  const users = Array.from(new Set([...(users1 || []), ...(users2 || [])]));

  if (users.length === 0) return [];

  // find other books these users have
  const favs = await Favorite.aggregate([
    { $match: { user: { $in: users }, book: { $ne: bookObjId } } },
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  const reads = await Reading.aggregate([
    { $match: { user: { $in: users }, book: { $ne: bookObjId } } },
    { $group: { _id: "$book", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  const map = new Map();
  for (const r of favs)
    map.set(String(r._id), (map.get(String(r._id)) || 0) + r.count);
  for (const r of reads)
    map.set(String(r._id), (map.get(String(r._id)) || 0) + r.count);

  const sorted = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map((x) => x[0]);

  return fetchBooksByIds(sorted);
}

/* 4) Hybrid: combine strategies and dedupe */
export async function recommendForUser(
  userId,
  { seedBookId = null, limit = 20 } = {}
) {
  // 1) popularity (global)
  const popular = await popularBooks({ limit: Math.ceil(limit / 2) });

  // 2) if we have a seed book, get content + collaborative
  let sims = [];
  if (seedBookId) {
    const c1 = await contentBasedSimilar(seedBookId, { limit });
    const c2 = await collaborativeSimilar(seedBookId, { limit });
    sims = [...c1, ...c2];
  }

  // 3) personalize using user's favorites / reading to boost matched authors
  const userFavs = await Favorite.find({ user: userId }).limit(100);
  const favBookIds = userFavs.map((f) => String(f.book));

  // combine preserving order: sims first (if present), then popular
  const combined = [...sims, ...popular];

  // dedupe by _id and remove books user already has (favorited or in reading)
  const userReading = await Reading.distinct("book", { user: userId });
  const skipSet = new Set([
    ...favBookIds,
    ...(userReading || []).map((x) => String(x)),
  ]);

  const seen = new Set();
  const results = [];
  for (const b of combined) {
    if (!b) continue;
    const id = String(b._id || b);
    if (seen.has(id)) continue;
    if (skipSet.has(id)) continue;
    seen.add(id);
    results.push(b);
    if (results.length >= limit) break;
  }

  return results;
}
