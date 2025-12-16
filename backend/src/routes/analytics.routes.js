// backend/src/routes/analytics.routes.js
//
// Analytics Routes
//
// Responsibilities:
// - Expose user-specific reading analytics
// - Provide data for dashboards, charts, streaks, and heatmaps
//
// Security:
// - All routes are protected (auth required)
//
// Controllers used:
// - analytics.controller.js
//
// Route prefix:
// - /api/analytics
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  getReadingSummary,
  getMonthlyReadingStats,
  getReadingStreaks,
  getReadingHeatmap,
} from "../controllers/analytics.controller.js";

const router = express.Router();

/* ======================================================
   READING ANALYTICS
====================================================== */

/**
 * GET /api/analytics/reading/summary
 * Returns:
 * - totalBooks
 * - finished
 * - reading
 * - toRead
 */
router.get("/reading/summary", auth, getReadingSummary);

/**
 * GET /api/analytics/reading/monthly
 * Returns:
 * - Array of { month: YYYY-MM, finished }
 * Used for monthly charts
 */
router.get("/reading/monthly", auth, getMonthlyReadingStats);

/**
 * GET /api/analytics/reading/streaks
 * Returns:
 * - currentStreak
 * - longestStreak
 * - lastReadDate
 * - isActiveToday
 */
router.get("/reading/streaks", auth, getReadingStreaks);

/* ======================================================
   HEATMAP
====================================================== */

/**
 * GET /api/analytics/heatmap?days=180
 * Returns:
 * - Per-day activity counts for heatmap visualizations
 */
router.get("/heatmap", auth, getReadingHeatmap);

export default router;
