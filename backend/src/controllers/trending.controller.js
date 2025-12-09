// backend/src/controllers/trending.controller.js
import TrendingService from "../services/trending.service.js";

export async function getTrending(req, res) {
  try {
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "20")));
    const windowDays = Math.max(1, parseInt(req.query.window || "7")); // days

    const results = await TrendingService.getTrendingBooks(limit, {
      windowDays,
    });

    // Ensure results is an array
    if (!Array.isArray(results) || results.length === 0) {
      return res
        .status(200)
        .json({ total: 0, items: [], message: "No trending books found" });
    }

    return res.status(200).json({ total: results.length, items: results });
  } catch (err) {
    // Server-side log with full stack
    console.error(
      "[TrendingController] error:",
      err && err.stack ? err.stack : err
    );

    // Do not return ambiguous or internal messages to client
    return res.status(500).json({
      message: "Failed to compute trending books",
      error: err?.message ?? "internal_error",
    });
  }
}
