// backend/src/utils/userTasteVector.js
// Computes a user's taste vector based on historical interactions.
// Designed to be robust, bounded, and tolerant to partial failures.
//
// Signals used:
// - Reading history
// - Reviews
//
// Output:
// - Normalized dense vector
// - null if insufficient data (cold user)

import Reading from "../models/Reading.js";
import Review from "../models/Review.js";
import {
  getEmbeddingForText,
  normalizeVector as normalizeFromEmbeddings,
} from "./embeddings.js";

/**
 * Lightweight normalization fallback.
 * Used only if embeddings utility normalization is unavailable.
 */
function normalizeVectorSimple(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + (x || 0) ** 2, 0));
  if (norm === 0) return v;
  return v.map((x) => (x || 0) / norm);
}

/**
 * Computes a user's taste vector by averaging embeddings
 * derived from books the user has read or reviewed.
 *
 * @param {string|ObjectId} userId
 * @returns {Array<number>|null}
 */
export async function computeUserTasteVector(userId) {
  if (!userId) return null;

  // Limit signals to keep computation bounded
  const reads = await Reading.find({ user: userId })
    .populate("book")
    .lean()
    .limit(50);

  const reviews = await Review.find({ user: userId })
    .populate("book")
    .lean()
    .limit(50);

  // Collect candidate books from both sources
  const candidates = [];

  for (const r of reads) {
    if (r.book) candidates.push(r.book);
  }

  for (const r of reviews) {
    if (r.book) candidates.push(r.book);
  }

  if (candidates.length === 0) return null;

  const vectors = [];

  for (const b of candidates) {
    // Prefer stored embeddings if available
    if (Array.isArray(b.embedding) && b.embedding.length) {
      vectors.push(b.embedding);
      continue;
    }

    // Fallback to text-based embedding
    const text = `${b.title || ""} ${b.subtitle || ""} ${
      b.description || ""
    }`.slice(0, 2000); // cap length for safety

    try {
      const emb = await getEmbeddingForText(text);
      if (emb) vectors.push(emb);
    } catch {
      // Intentionally ignore single embedding failures
    }
  }

  if (vectors.length === 0) return null;

  // Mean aggregation of vectors
  const dim = vectors[0].length;
  const agg = new Array(dim).fill(0);

  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      agg[i] += v[i] || 0;
    }
  }

  for (let i = 0; i < dim; i++) {
    agg[i] /= vectors.length;
  }

  // Prefer shared normalization if available
  try {
    if (typeof normalizeFromEmbeddings === "function") {
      return normalizeFromEmbeddings(agg);
    }
  } catch {
    // Fallback normalization below
  }

  return normalizeVectorSimple(agg);
}

export default computeUserTasteVector;
