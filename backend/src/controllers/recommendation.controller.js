// backend/src/controllers/recommend.controller.js
import {
  recommendForUser,
  contentBasedSimilar,
  collaborativeSimilar,
  popularBooks,
  fetchBooksByIds,
} from "../utils/recommender.js";

/* GET /api/recommend/me?seedBookId=&limit=20 */
export async function recommendForMe(req, res, next) {
  try {
    const userId = req.user.id;
    const seedBookId = req.query.seedBookId || null;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    // recommendForUser returns array of { book, score, sources }
    const items = await recommendForUser(userId, { seedBookId, limit });

    // Format response: list of books with _score and sources
    const books = items.map((it) => {
      // some items may be plain Book docs (if your function returned Book alone) — normalize
      const bookDoc = it.book || it;
      const score = it.score ?? bookDoc._score ?? null;
      const sources = it.sources ?? it._sources ?? [];
      return { book: bookDoc, score, sources };
    });

    res.json({ books });
  } catch (err) {
    next(err);
  }
}

/* GET /api/recommend/similar/:bookId?limit=20 */
export async function similarToBook(req, res, next) {
  try {
    const bookId = req.params.bookId;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    if (!bookId) return res.status(400).json({ message: "bookId required" });

    // Try content + collaborative, merge
    const content = await contentBasedSimilar(bookId, {
      limit: Math.ceil(limit / 2),
    });
    const coll = await collaborativeSimilar(bookId, {
      limit: Math.ceil(limit / 2),
    });

    // merge deduped
    const seen = new Set();
    const items = [];
    for (const b of [...content, ...coll]) {
      const id = String(b._id);
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(b);
      if (items.length >= limit) break;
    }

    res.json({ books: items });
  } catch (err) {
    next(err);
  }
}

/* GET /api/recommend/popular?limit=20 */
export async function getPopular(req, res, next) {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const books = await popularBooks({ limit });
    res.json({ books });
  } catch (err) {
    next(err);
  }
}
