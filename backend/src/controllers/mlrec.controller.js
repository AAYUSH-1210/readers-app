// backend/src/controllers/mlrec.controller.js
import Book from "../models/Book.js";
import {
  saveCorpusEmbeddingsToDB,
  findSimilarByEmbedding,
  computeAndSaveBestEmbedding,
} from "../utils/embeddings.js";
import mongoose from "mongoose";

/* ------------------------------------------
   POST /api/mlrec/compute-all
   Recomputes CORPUS TF-IDF embeddings
------------------------------------------- */
export async function computeAllEmbeddings(req, res, next) {
  try {
    const totalBooks = await Book.countDocuments();
    const updated = await saveCorpusEmbeddingsToDB();
    res.json({
      message: "Corpus TF-IDF embeddings computed",
      totalBooks,
      updated,
    });
  } catch (err) {
    next(err);
  }
}

/* ------------------------------------------
   GET /api/mlrec/similar/:bookId?limit=10
   Uses OpenAI → fallback TF-IDF if missing
------------------------------------------- */
export async function similarByML(req, res, next) {
  try {
    const { bookId } = req.params;
    const limit = Math.min(50, parseInt(req.query.limit || "10", 10));

    if (!bookId) return res.status(400).json({ message: "bookId required" });

    /* -----------------------------
       1) Resolve book by ID or externalId
    ------------------------------ */
    let book = null;

    if (mongoose.isValidObjectId(bookId)) {
      book = await Book.findById(bookId);
    } else {
      const path1 = bookId.startsWith("/") ? bookId : `/${bookId}`;
      book =
        (await Book.findOne({ externalId: bookId })) ||
        (await Book.findOne({ externalId: path1 }));
    }

    if (!book) return res.status(404).json({ message: "Book not found" });

    /* -----------------------------
       2) Compute embedding if missing
       (OpenAI → fallback TF-IDF)
    ------------------------------ */
    if (!book.embedding || !book.embedding.length) {
      await computeAndSaveBestEmbedding(book); // 🔥 OUR NEW SMART LOGIC
      book = await Book.findById(book._id); // reload with embedding
    }

    /* -----------------------------
       3) Find similar books
    ------------------------------ */
    const matches = await findSimilarByEmbedding(book.embedding, {
      limit: limit + 1,
    });

    // remove self
    const filtered = matches
      .filter((m) => String(m.book._id) !== String(book._id))
      .slice(0, limit);

    return res.json({
      seed: book._id,
      count: filtered.length,
      books: filtered,
    });
  } catch (err) {
    next(err);
  }
}
