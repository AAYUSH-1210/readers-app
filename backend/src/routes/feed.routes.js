// backend/src/routes/feed.routes.js
//
// Feed Routes
//
// Responsibilities:
// - Serve personalized user feed
// - Provide homepage feed sections (trending / recommended / following)
// - Support feed previews (for polling / unread counts)
// - Track when a user has seen their feed
//
// Notes:
// - All routes require authentication
// - Heavy lifting is delegated to FeedService
// - FeedService internally handles caching and ranking
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  getFeed,
  getPreview,
  markFeedSeen,
  getHomeFeed,
} from "../controllers/feed.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/feed
====================================================== */
/**
 * Returns the main paginated feed for the current user.
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 20, max: 50)
 * - types (optional, comma-separated: personal,trending,following)
 * - since (optional ISO date for unread filtering)
 */
router.get("/", auth, getFeed);

/* ======================================================
   GET /api/feed/home
====================================================== */
/**
 * Returns homepage feed sections.
 *
 * Sections:
 * - trending
 * - recommended (personalized)
 * - following
 *
 * Fixed limits per section (handled in controller).
 */
router.get("/home", auth, getHomeFeed);

/* ======================================================
   GET /api/feed/preview
====================================================== */
/**
 * Returns a small preview of the feed.
 *
 * Used for:
 * - Polling new items
 * - Unread count indicators
 *
 * Query params:
 * - since (optional ISO date)
 * - types (optional)
 */
router.get("/preview", auth, getPreview);

/* ======================================================
   POST /api/feed/mark-seen
====================================================== */
/**
 * Marks the feed as seen for the current user.
 *
 * Updates:
 * - user.lastFeedSeen
 *
 * Used to reset unread count.
 */
router.post("/mark-seen", auth, markFeedSeen);

export default router;
