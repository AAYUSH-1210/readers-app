// backend/src/controllers/mlrec.controller.js
//
// ML Recommendation Controller (STUB)
//
// Responsibilities:
// - Expose ML-based recommendation endpoints
// - Maintain API compatibility while ML pipeline is not active
// - Prevent runtime errors in routes or services depending on ML endpoints
//
// Current State:
// - This is a SAFE STUB implementation
// - No embeddings are computed here
// - No ML similarity is returned
//
// Future:
// - Will be replaced with real vector-based / model-based logic
// - Endpoint contracts MUST remain stable
//
// IMPORTANT:
// - Do NOT remove these endpoints
// - FeedService and routes may depend on them
// - This file guarantees backward compatibility

import mongoose from "mongoose";
import Book from "../models/Book.js";
import { findSimilarByEmbedding } from "../utils/embeddings.js"; // reserved for future use

/* ======================================================
   POST /api/mlrec/compute-all
====================================================== */
/**
 * Stub endpoint for computing embeddings.
 *
 * Intended future behavior:
 * - Compute embeddings for all books
 * - Persist vectors for ML similarity search
 *
 * Current behavior:
 * - Returns total book count only
 * - Does NOT modify database
 */
export async function computeAllEmbeddings(req, res, next) {
  try {
    const totalBooks = await Book.countDocuments();

    return res.json({
      message: "ML embedding computation is disabled (stub)",
      status: "stub",
      totalBooks,
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/mlrec/similar/:bookId
====================================================== */
/**
 * Stub endpoint for ML-based similarity.
 *
 * Params:
 * - bookId (required): Mongo ObjectId
 *
 * Intended future behavior:
 * - Fetch embedding for seed book
 * - Query vector index
 * - Return similar books
 *
 * Current behavior:
 * - Validates input
 * - Returns empty result set
 */
export async function similarByML(req, res, next) {
  try {
    const { bookId } = req.params;

    if (!bookId) {
      return res.status(400).json({
        message: "bookId is required",
      });
    }

    if (!mongoose.isValidObjectId(bookId)) {
      return res.status(400).json({
        message: "Invalid bookId format",
      });
    }

    // Ensure book exists (defensive check)
    const exists = await Book.exists({ _id: bookId });
    if (!exists) {
      return res.status(404).json({
        message: "Book not found",
      });
    }

    // Stub response
    return res.json({
      seed: bookId,
      status: "stub",
      count: 0,
      books: [],
    });
  } catch (err) {
    next(err);
  }
}
