// backend/src/routes/trending.routes.js
//
// Trending Routes
//
// Responsibilities:
// - Expose trending book discovery endpoint
// - Surface books with recent engagement (reviews, reading activity)
//
// Notes:
// - Trending is time-window based
// - Computation is handled entirely by TrendingService
// - Used by FeedService and discovery pages
//
// Base path:
// - /api/trending
//
// Authentication:
// - Required (can be relaxed later if needed)

import express from "express";
import auth from "../middleware/auth.js";
import { getTrending } from "../controllers/trending.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/trending
====================================================== */
/**
 * Returns trending books for a given time window.
 *
 * Query Params:
 * - limit  (optional, default: 20, max: 100)
 * - window (optional, days, default: 7)
 *
 * Response:
 * {
 *   total: number,
 *   items: [
 *     {
 *       book: {
 *         _id,
 *         title,
 *         authors,
 *         coverUrl,
 *         avgRating
 *       },
 *       trendingScore: number,
 *       recentReviews: number,
 *       readingStarts: number,
 *       fallback: boolean
 *     }
 *   ]
 * }
 *
 * Behavior:
 * - If no recent activity exists, falls back to popular books
 * - Always returns an array (never null)
 */
router.get("/", auth, getTrending);

export default router;
