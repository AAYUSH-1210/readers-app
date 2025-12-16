// backend/src/controllers/trending.controller.js
// Trending controller.
//
// Responsibilities:
// - Expose a read-only endpoint for trending books
// - Parse and validate query parameters
// - Delegate all computation to TrendingService
//
// Notes:
// - This controller is stateless
// - Empty results are a valid, non-error outcome

import TrendingService from "../services/trending.service.js";

/**
 * GET /api/trending
 *
 * Query params:
 * - limit: number (1–100), default 20
 * - window: number of days to look back (default 7)
 *
 * Response:
 * {
 *   total: number,
 *   items: Array
 * }
 */
export async function getTrending(req, res) {
  try {
    // Clamp limit to a safe range
    const limit = Math.max(
      1,
      Math.min(100, parseInt(req.query.limit || "20", 10))
    );

    // Query param `window` maps to service option `windowDays`
    const windowDays = Math.max(1, parseInt(req.query.window || "7", 10));

    const results = await TrendingService.getTrendingBooks(limit, {
      windowDays,
    });

    // Empty result set is a valid response
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(200).json({
        total: 0,
        items: [],
        message: "No trending books found",
      });
    }

    return res.status(200).json({ total: results.length, items: results });
  } catch (err) {
    // Server-side log with full stack
    console.error(
      "[TrendingController] error:",
      err && err.stack ? err.stack : err
    );

    // Client receives a clean, non-internal error message
    return res.status(500).json({
      message: "Failed to compute trending books",
      error: err?.message ?? "internal_error",
    });
  }
}
