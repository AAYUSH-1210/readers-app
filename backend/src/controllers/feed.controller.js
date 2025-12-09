// backend/src/controllers/feed.controller.js
import FeedService from "../services/feed.service.js";

export async function getFeed(req, res) {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || "1"));
    const limit = Math.min(50, parseInt(req.query.limit || "20"));
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
    return res.json(result);
  } catch (err) {
    console.error("FeedController error", err);
    return res
      .status(500)
      .json({ message: "Failed to generate feed", error: err.message });
  }
}
