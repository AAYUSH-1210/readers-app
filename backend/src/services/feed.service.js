// backend/src/services/feed.service.js
import mongoose from "mongoose";
import RecommenderService from "./recommender.service.js";
import TrendingService from "./trending.service.js";
import { v4 as uuidv4 } from "uuid";
import { cacheGet, cacheSet } from "./cacheWrapper.js";
import Activity from "../models/Activity.js";
import Follow from "../models/Follow.js";

const CANDIDATE_LIMIT = 120;
const DEFAULT_WEIGHTS = { score: 0.72, recency: 0.28 };

function recencyBoost(createdAt) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.max(0, ms / (1000 * 60 * 60));
  const halfLife = 36;
  return Math.max(0, 1 - hours / (halfLife * 2));
}

function normalizeBookKey(book) {
  if (!book) return null;
  if (book._id) return String(book._id);
  if (book.externalId) return String(book.externalId);
  return `T:${(book.title || "").slice(0, 60)}|A:${(Array.isArray(book.authors)
    ? book.authors[0]
    : book.author || ""
  ).slice(0, 40)}`;
}

async function safeCall(fn, ...args) {
  if (!fn) return [];
  try {
    return await fn(...args);
  } catch (e) {
    console.error("Feed provider error:", e && e.message ? e.message : e);
    return [];
  }
}

// build a friendly reason string from provider raw
function friendlyReasonFor(item, source) {
  if (!item) return null;
  if (item.reason && typeof item.reason === "string") return item.reason;
  // recommender returns reason like 'cf_cooccur:3' — derive friendlier text
  if (
    item.reason &&
    item.reason.startsWith &&
    item.reason.startsWith("cf_cooccur:")
  ) {
    const parts = item.reason.split(":");
    const count = parts[1] || "";
    return `Because similar readers liked it (${count})`;
  }
  if (item.raw && item.raw.seedBookTitle)
    return `Because you read "${item.raw.seedBookTitle}"`;
  if (source === "trending") return "Trending now";
  if (source === "following") return "New from people you follow";
  return null;
}

export default {
  async composeFeed(
    userId,
    {
      page = 1,
      limit = 20,
      types = ["personal", "trending", "following"],
      since,
    } = {}
  ) {
    // use caching for heavy providers
    const personalKey = `feed:personal:${userId}`;
    const trendingKey = `feed:trending`;

    const personalRaw = types.includes("personal")
      ? (await cacheGet(personalKey)) ??
        (await (async () => {
          const res = await safeCall(
            RecommenderService.getPersonalizedPicks,
            userId,
            CANDIDATE_LIMIT
          );
          await cacheSet(personalKey, res, 60 * 5); // cache 5 min
          return res;
        })())
      : [];

    const trendingRaw = types.includes("trending")
      ? (await cacheGet(trendingKey)) ??
        (await (async () => {
          const res = await safeCall(
            TrendingService.getTrendingBooks,
            CANDIDATE_LIMIT,
            since
          );
          await cacheSet(trendingKey, res, 60 * 2); // trending 2 min cache
          return res;
        })())
      : [];

    // following: activity (recent reviews by followed users)
    let followingRaw = [];
    try {
      // fetch recent activity from users the current user follows
      if (userId) {
        // Guard: skip DB query if userId isn't a valid ObjectId (tests or non-DB ids)
        if (!mongoose.isValidObjectId(String(userId))) {
          // do nothing — leave followingRaw empty
        } else {
          const followers = await Follow.find({ follower: userId })
            .select("following")
            .lean();
          const followingIds = followers.map((r) => r.following);
          if (followingIds.length) {
            const actQuery = {
              actor: { $in: followingIds },
              type: { $in: ["review", "reading", "note", "shelf"] },
            };
            if (since) actQuery.createdAt = { $gte: new Date(since) };
            const acts = await Activity.find(actQuery)
              .sort({ createdAt: -1 })
              .limit(CANDIDATE_LIMIT)
              .lean();
            // convert activities into feed-like items
            followingRaw = acts.map((a) => ({
              activity: a,
              book: a.book
                ? a.book
                : a.meta?.bookId
                ? { _id: a.meta.bookId }
                : null,
              createdAt: a.createdAt,
              score: 0.6,
              reason: a.message || `${a.actor} ${a.action}`,
              sourceActivity: true,
            }));
          }
        }
      }
    } catch (e) {
      console.error(
        "Error fetching following activity",
        e && e.message ? e.message : e
      );
      followingRaw = [];
    }

    // Normalize inputs
    const normalize = (arr, type) =>
      (arr || []).map((item) => {
        const book = item.book || item.activity?.book || item.raw?.book || item;
        const createdAt =
          item.createdAt ||
          item.activity?.createdAt ||
          book?.updatedAt ||
          book?.createdAt ||
          new Date();
        const score =
          typeof item.score === "number"
            ? item.score
            : item.trendingScore ?? 0.5;
        return {
          id: uuidv4(),
          type,
          book,
          score,
          createdAt,
          raw: item,
          source: type,
          friendlyReason: friendlyReasonFor(item, type),
        };
      });

    let items = [
      ...normalize(personalRaw, "personal"),
      ...normalize(trendingRaw, "trending"),
      ...normalize(followingRaw, "following"),
    ];

    // Dedupe with rules
    const map = new Map();
    for (const it of items) {
      const key = normalizeBookKey(it.book);
      if (!key) continue;
      if (!map.has(key)) map.set(key, it);
      else {
        const existing = map.get(key);
        if (it.type === "following" && existing.type !== "following")
          map.set(key, it);
        else if (existing.type === "following" && it.type !== "following") {
          // keep existing following
        } else if ((it.score ?? 0) > (existing.score ?? 0)) map.set(key, it);
      }
    }

    items = Array.from(map.values());

    // compute rank
    items = items.map((it) => {
      const rBoost = recencyBoost(it.createdAt);
      const rank =
        DEFAULT_WEIGHTS.score * (it.score ?? 0) +
        DEFAULT_WEIGHTS.recency * rBoost;
      return { ...it, rank, rBoost };
    });

    items.sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // filter by since if provided (so preview/unread uses it)
    if (since) {
      items = items.filter((it) => new Date(it.createdAt) > new Date(since));
    }

    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    // minimal payload mapping (include source & friendlyReason)
    const minimalItems = paged.map((it) => {
      const b = it.book || {};
      return {
        id: it.id,
        source: it.source || it.type,
        score: it.score,
        rank: it.rank,
        createdAt: it.createdAt,
        friendlyReason: it.friendlyReason || (it.raw && it.raw.reason) || null,
        book: {
          _id: b._id,
          externalId: b.externalId,
          title: b.title,
          authors: b.authors || [],
          coverUrl: b.cover || b.coverUrl || null,
          avgRating: b.avgRating || null,
          genres: b.genres || [],
        },
        meta: { providerRaw: it.raw || null },
      };
    });

    return { page, limit, total, items: minimalItems };
  },
};
