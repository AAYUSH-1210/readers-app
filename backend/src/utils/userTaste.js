// backend/src/utils/userTaste.js
// Computes a user's taste vector from explicit interaction signals.
// Uses weighted averaging of book embeddings derived from
// UserBookInteraction records.
//
// This utility is intentionally simple and synchronous in logic:
// - No caching
// - No retries
// - No cross-user aggregation

import UserBookInteraction from "../models/UserBookInteraction.js";
import Book from "../models/Book.js";

/**
 * Computes a weighted user taste vector by averaging book embeddings.
 *
 * @param {string|ObjectId} userId
 * @returns {Array<number>|null} Normalized vector or null if insufficient data
 */
export async function computeUserTasteVector(userId) {
  if (!userId) return null;

  // Fetch user interaction signals
  const interactions = await UserBookInteraction.find({ user: userId }).lean();

  if (!interactions.length) return null;

  // Collect unique book IDs to avoid N+1 queries
  const bookIds = interactions.map((i) => i.book).filter(Boolean);

  if (!bookIds.length) return null;

  const books = await Book.find({ _id: { $in: bookIds } })
    .select("embedding")
    .lean();

  // Map books by id for fast lookup
  const bookMap = new Map(books.map((b) => [String(b._id), b]));

  let sum = [];
  let totalWeight = 0;

  for (const i of interactions) {
    const book = bookMap.get(String(i.book));
    if (!book || !Array.isArray(book.embedding)) continue;

    const w = i.weight || 1;
    totalWeight += w;

    if (sum.length === 0) {
      // Initialize aggregation vector
      sum = Array.from(book.embedding);
    } else {
      for (let k = 0; k < sum.length; k++) {
        sum[k] += (book.embedding[k] || 0) * w;
      }
    }
  }

  // Guard against divide-by-zero or empty aggregation
  if (totalWeight === 0 || sum.length === 0) return null;

  // Compute weighted mean
  for (let i = 0; i < sum.length; i++) {
    sum[i] = sum[i] / totalWeight;
  }

  // Normalize result vector (cosine similarity safe)
  const norm = Math.sqrt(sum.reduce((s, x) => s + x * x, 0));
  if (norm === 0) return null;

  return sum.map((v) => v / norm);
}

export default computeUserTasteVector;
