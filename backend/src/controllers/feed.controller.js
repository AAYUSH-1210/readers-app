// backend/src/controllers/feed.controller.js
// Feed controller.
//
// Responsibilities:
// - Expose endpoints for the main feed, preview feed, and home feed sections
// - Delegate all heavy logic to FeedService
// - Handle unread-count computation and lastFeedSeen tracking
//
// Notes:
// - Unread counts are computed only on returned items (paged),
//   NOT globally across the full feed.
// - FeedService.composeFeed is the single source of truth for ranking logic.

import FeedService from "../services/feed.service.js";
import User from "../models/User.js";

/**
 * GET /api/feed
 * Returns paginated feed items with unreadCount.
 *
 * IMPORTANT:
 * - unreadCount is computed ONLY within the returned page
 * - This is intentional and should be treated as a lightweight indicator,
 *   not a global unread counter
 */
export async function getFeed(req, res) {
  try {
    const userId = req.user.id;

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));

    const types = req.query.types
      ? req.query.types.split(",")
      : ["personal", "trending", "following"];

    const since = req.query.since ? new Date(req.query.since) : undefined;

    const result = await FeedService.composeFeed(userId, {
      page,
      limit,
      types,
      since,
    });

    // Compute unread count (page-scoped, not global)
    let unreadCount = 0;

    if (req.query.since) {
      const sinceDate = new Date(req.query.since);
      unreadCount = result.items.filter(
        (it) => new Date(it.createdAt) > sinceDate
      ).length;
    } else if (req.user?.id) {
      // lastFeedSeen is not attached to req.user by auth middleware,
      // so we must fetch it explicitly
      const me = await User.findById(req.user.id).select("lastFeedSeen").lean();

      if (me?.lastFeedSeen) {
        unreadCount = result.items.filter(
          (it) => new Date(it.createdAt) > new Date(me.lastFeedSeen)
        ).length;
      }
    }

    return res.json({ ...result, unreadCount });
  } catch (err) {
    console.error("FeedController error", err && err.stack ? err.stack : err);
    return res.status(500).json({
      message: "Failed to generate feed",
      error: err.message,
    });
  }
}

/**
 * GET /api/feed/preview
 * Lightweight preview endpoint.
 *
 * Notes:
 * - Works with or without authentication
 * - Uses a small fixed limit
 * - Useful for notification previews / badges
 */
export async function getPreview(req, res) {
  try {
    const userId = req.user?.id || null;

    const since = req.query.since ? new Date(req.query.since) : undefined;

    const types = req.query.types
      ? req.query.types.split(",")
      : ["personal", "trending", "following"];

    const result = await FeedService.composeFeed(userId, {
      page: 1,
      limit: 6,
      types,
      since,
    });

    return res.json({
      items: result.items,
      total: result.total,
      previewSince: since ? since.toISOString() : null,
    });
  } catch (e) {
    console.error("getPreview error", e && e.stack ? e.stack : e);
    res.status(500).json({ message: "preview failed" });
  }
}

/**
 * POST /api/feed/seen
 * Marks the feed as seen for the current user.
 *
 * This updates User.lastFeedSeen and is used by unread-count logic.
 */
export async function markFeedSeen(req, res, next) {
  try {
    const userId = req.user.id;
    await User.findByIdAndUpdate(userId, {
      lastFeedSeen: new Date(),
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/feed/home
 * Returns a sectioned feed for the homepage.
 *
 * Sections:
 * - trending
 * - recommended (personalized)
 * - following
 *
 * Notes:
 * - Uses a single composed feed internally
 * - Section order follows ranked feed order
 * - Section limits are fixed and UI-driven
 */
export async function getHomeFeed(req, res) {
  try {
    const userId = req.user.id;

    // Fixed homepage section limits (UI contract)
    const SECTION_LIMITS = {
      trending: 10,
      personal: 10,
      following: 10,
    };

    // Fetch a sufficiently large ranked feed once
    const result = await FeedService.composeFeed(userId, {
      page: 1,
      limit: 50,
      types: ["personal", "trending", "following"],
    });

    const sections = {
      trending: [],
      recommended: [],
      following: [],
    };

    for (const item of result.items) {
      if (
        item.source === "trending" &&
        sections.trending.length < SECTION_LIMITS.trending
      ) {
        sections.trending.push(item);
      }

      // Map "personal" source to "recommended" section
      if (
        item.source === "personal" &&
        sections.recommended.length < SECTION_LIMITS.personal
      ) {
        sections.recommended.push(item);
      }

      if (
        item.source === "following" &&
        sections.following.length < SECTION_LIMITS.following
      ) {
        sections.following.push(item);
      }
    }

    return res.json(sections);
  } catch (err) {
    console.error("getHomeFeed error", err && err.stack ? err.stack : err);
    return res.status(500).json({ message: "Failed to load home feed" });
  }
}
