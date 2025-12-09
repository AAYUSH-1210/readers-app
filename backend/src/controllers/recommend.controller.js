// backend/src/controllers/recommend.controller.js
import {
  recommendForUser,
  contentBasedSimilar,
  collaborativeSimilar,
  popularBooks,
  fetchBooksByIds,
} from "../utils/recommender.js";
import Book from "../models/Book.js";

/* GET /api/recommend/me?seedBookId=&limit=20
   - seedBookId optional (Mongo _id)
*/
export async function recommendForMe(req, res, next) {
  try {
    const userId = req.user.id;
    const seedBookId = req.query.seedBookId || null;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    const books = await recommendForUser(userId, { seedBookId, limit });
    res.json({ books });
  } catch (err) {
    next(err);
  }
}

/* GET /api/recommend/similar/:bookId?limit=20
   returns a mix of content+collaborative similar books
*/
export async function similarToBook(req, res, next) {
  try {
    const bookId = req.params.bookId;
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    // try to accept externalId too: if value starts with /works/ or OL... try to find book
    let book = null;
    if (!bookId) return res.status(400).json({ message: "bookId required" });

    // if not ObjectId, try find by externalId
    if (!bookId.match(/^[0-9a-fA-F]{24}$/)) {
      // treat as externalId or OL id
      const maybe =
        (await Book.findOne({ externalId: bookId })) ||
        (await Book.findOne({ externalId: `/${bookId}` }));
      if (maybe) book = maybe;
    } else {
      book = await Book.findById(bookId);
    }

    if (!book) {
      return res.status(404).json({
        message: "Recommendation target book not found",
        code: "BOOK_NOT_FOUND",
      });
    }

    const c = await contentBasedSimilar(book._id, {
      limit: Math.ceil(limit / 2),
    });
    const col = await collaborativeSimilar(book._id, {
      limit: Math.ceil(limit / 2),
    });

    // merge deduped
    const seen = new Set();
    const items = [];
    for (const b of [...c, ...col]) {
      if (!b) continue;
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
