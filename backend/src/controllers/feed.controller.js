// backend/src/controllers/feed.controller.js
import FeedService from "../services/feed.service.js";
import User from "../models/User.js";

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

    // compute unreadCount if since provided or if user has lastFeedSeen
    let unreadCount = 0;
    if (req.query.since) {
      const sinceDate = new Date(req.query.since);
      unreadCount = result.items.filter(
        (it) => new Date(it.createdAt) > sinceDate
      ).length;
    } else if (req.user && req.user.id) {
      const me = await User.findById(req.user.id).select("lastFeedSeen").lean();
      if (me && me.lastFeedSeen) {
        unreadCount = result.items.filter(
          (it) => new Date(it.createdAt) > new Date(me.lastFeedSeen)
        ).length;
      }
    }

    return res.json({ ...result, unreadCount });
  } catch (err) {
    console.error("FeedController error", err && err.stack ? err.stack : err);
    return res
      .status(500)
      .json({ message: "Failed to generate feed", error: err.message });
  }
}

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

export async function markFeedSeen(req, res, next) {
  try {
    const userId = req.user.id;
    await User.findByIdAndUpdate(userId, { lastFeedSeen: new Date() });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
}
