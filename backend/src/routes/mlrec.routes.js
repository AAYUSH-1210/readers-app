// backend/src/routes/mlrec.routes.js
//
// ML Recommendation Routes (STUB)
//
// Responsibilities:
// - Expose ML-based recommendation endpoints
// - Maintain API compatibility while ML pipeline is inactive
// - Prevent runtime failures in services depending on ML routes
//
// Current State:
// - All endpoints are SAFE STUBS
// - No embeddings are computed
// - No ML similarity is returned
//
// IMPORTANT:
// - These routes MUST NOT be removed
// - Controllers guarantee backward compatibility
//
// Base path:
// - /api/mlrec
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  computeAllEmbeddings,
  similarByML,
} from "../controllers/mlrec.controller.js";

const router = express.Router();

/* ======================================================
   POST /api/mlrec/compute-all
====================================================== */
/**
 * Trigger ML embedding computation (stub).
 *
 * Auth required.
 *
 * Current behavior:
 * - Does NOT compute embeddings
 * - Returns total book count
 *
 * Future:
 * - Will recompute and persist vector embeddings
 */
router.post("/compute-all", auth, computeAllEmbeddings);

/* ======================================================
   GET /api/mlrec/similar/:bookId
====================================================== */
/**
 * Fetch ML-based similar books (stub).
 *
 * Params:
 * - bookId (Mongo ObjectId)
 *
 * Current behavior:
 * - Validates input
 * - Returns empty list
 *
 * Public endpoint (read-only).
 */
router.get("/similar/:bookId", similarByML);

export default router;
