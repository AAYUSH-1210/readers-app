// backend/src/services/feed.service.js
// Feed composition service.
//
// Responsibilities:
// - Aggregate feed candidates from multiple providers:
//   * Personalized recommendations
//   * Trending books
//   * Activity from followed users
// - Cache heavy providers independently
// - Deduplicate items across sources
// - Rank items using score + recency
// - Support pagination and unread ("since") filtering
//
// Design principles:
// - Provider failures must not break the feed
// - Ranking should favor relevance but reward freshness
// - Following activity has higher priority during dedupe

import mongoose from "mongoose";
import RecommenderService from "./recommender.service.js";
import TrendingService from "./trending.service.js";
import { v4 as uuidv4 } from "uuid";
import { cacheGet, cacheSet } from "./cacheWrapper.js";
import Activity from "../models/Activity.js";
import Follow from "../models/Follow.js";

// Overfetch candidates to allow dedupe and ranking
const CANDIDATE_LIMIT = 120;

// Ranking weights: relevance dominates, recency adds freshness
const DEFAULT_WEIGHTS = { score: 0.72, recency: 0.28 };

/**
 * Computes a recency boost in range [0, 1].
 * Uses a soft linear decay with ~36h half-life.
 */
function recencyBoost(createdAt) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.max(0, ms / (1000 * 60 * 60));
  const halfLife = 36;
  return Math.max(0, 1 - hours / (halfLife * 2));
}

/**
 * Generates a stable dedupe key for a book-like object.
 * Falls back to title + author when no ids exist.
 */
function normalizeBookKey(book) {
  if (!book) return null;
  if (book._id) return String(book._id);
  if (book.externalId) return String(book.externalId);

  // Fallback for activity-only or partial book objects
  return `T:${(book.title || "").slice(0, 60)}|A:${(Array.isArray(book.authors)
    ? book.authors[0]
    : book.author || ""
  ).slice(0, 40)}`;
}

/**
 * Wrapper to safely invoke a provider.
 * Provider failures are logged and treated as empty results.
 */
async function safeCall(fn, ...args) {
  if (!fn) return [];
  try {
    return await fn(...args);
  } catch (e) {
    console.error("Feed provider error:", e && e.message ? e.message : e);
    return [];
  }
}

/**
 * Converts provider-specific reason metadata into
 * a human-friendly explanation for the UI.
 */
function friendlyReasonFor(item, source) {
  if (!item) return null;

  if (item.reason && typeof item.reason === "string") {
    return item.reason;
  }

  // Collaborative filtering reason (example: cf_cooccur:3)
  if (
    item.reason &&
    item.reason.startsWith &&
    item.reason.startsWith("cf_cooccur:")
  ) {
    const count = item.reason.split(":")[1] || "";
    return `Because similar readers liked it (${count})`;
  }

  if (item.raw?.seedBookTitle) {
    return `Because you read "${item.raw.seedBookTitle}"`;
  }

  if (source === "trending") return "Trending now";
  if (source === "following") return "New from people you follow";

  return null;
}

export default {
  /**
   * Compose the homepage feed.
   *
   * @param {string|ObjectId} userId
   * @param {Object} options
   * @returns {Object} paginated feed response
   */
  async composeFeed(
    userId,
    {
      page = 1,
      limit = 20,
      types = ["personal", "trending", "following"],
      since,
    } = {}
  ) {
    // Cache keys:
    // - personal: per-user
    // - trending: global
    const personalKey = `feed:personal:${userId}`;
    const trendingKey = `feed:trending`;

    // PERSONALIZED
    const personalRaw = types.includes("personal")
      ? (await cacheGet(personalKey)) ??
        (await (async () => {
          const res = await safeCall(
            RecommenderService.getPersonalizedPicks,
            userId,
            CANDIDATE_LIMIT
          );
          await cacheSet(personalKey, res, 60 * 5); // 5 min cache
          return res;
        })())
      : [];

    // TRENDING
    const trendingRaw = types.includes("trending")
      ? (await cacheGet(trendingKey)) ??
        (await (async () => {
          const res = await safeCall(
            TrendingService.getTrendingBooks,
            CANDIDATE_LIMIT,
            since
          );
          await cacheSet(trendingKey, res, 60 * 2); // 2 min cache
          return res;
        })())
      : [];

    // FOLLOWING ACTIVITY
    let followingRaw = [];
    try {
      if (userId && mongoose.isValidObjectId(String(userId))) {
        const followers = await Follow.find({
          follower: userId,
        })
          .select("following")
          .lean();

        const followingIds = followers.map((r) => r.following);

        if (followingIds.length) {
          const actQuery = {
            actor: { $in: followingIds },
            type: {
              $in: ["review", "reading", "note", "shelf"],
            },
          };
          if (since) {
            actQuery.createdAt = {
              $gte: new Date(since),
            };
          }

          const acts = await Activity.find(actQuery)
            .sort({ createdAt: -1 })
            .limit(CANDIDATE_LIMIT)
            .lean();

          // Convert activity docs into feed-like items
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
    } catch (e) {
      console.error(
        "Error fetching following activity",
        e && e.message ? e.message : e
      );
      followingRaw = [];
    }

    /**
     * Normalize raw provider items into a common shape.
     */
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
          id: uuidv4(), // intentionally non-stable (UI list key)
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

    /**
     * Deduplication rules:
     * - Same book key collapses into one item
     * - Following activity wins over others
     * - Otherwise, higher score wins
     */
    const map = new Map();
    for (const it of items) {
      const key = normalizeBookKey(it.book);
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, it);
      } else {
        const existing = map.get(key);

        if (it.type === "following" && existing.type !== "following") {
          map.set(key, it);
        } else if (existing.type === "following" && it.type !== "following") {
          // keep existing
        } else if ((it.score ?? 0) > (existing.score ?? 0)) {
          map.set(key, it);
        }
      }
    }

    items = Array.from(map.values());

    // Compute final ranking score
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

    // Unread / preview filtering
    if (since) {
      items = items.filter((it) => new Date(it.createdAt) > new Date(since));
    }

    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    // Minimal payload sent to frontend
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
