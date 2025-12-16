// backend/src/routes/recommend.routes.js
//
// Recommendation Routes
//
// Responsibilities:
// - Expose discovery & recommendation endpoints
// - Serve personalized, similar-book, and popular-book recommendations
//
// Notes:
// - Heavy logic lives in utils/recommender.js
// - This layer is thin and stable
// - Designed to support FeedService and standalone discovery pages
//
// Base path:
// - /api/recommend
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  recommendForMe,
  similarToBook,
  getPopular,
} from "../controllers/recommend.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/recommend/me
====================================================== */
/**
 * Personalized recommendations for the current user.
 *
 * Query params:
 * - seedBookId (optional): Mongo ObjectId or externalId
 * - limit (optional, default 20, max 50)
 *
 * Auth:
 * - Required
 */
router.get("/me", auth, recommendForMe);

/* ======================================================
   GET /api/recommend/similar/:bookId
====================================================== */
/**
 * Get books similar to a given book.
 *
 * Params:
 * - bookId: Mongo ObjectId OR OpenLibrary externalId
 *
 * Query params:
 * - limit (optional, default 20)
 *
 * Auth:
 * - Not required (public discovery)
 */
router.get("/similar/:bookId", similarToBook);

/* ======================================================
   GET /api/recommend/popular
====================================================== */
/**
 * Get globally popular books.
 *
 * Query params:
 * - limit (optional, default 20, max 100)
 *
 * Auth:
 * - Not required
 */
router.get("/popular", getPopular);

export default router;
