// backend/src/services/feed.service.js
import RecommenderService from "./recommender.service.js";
import TrendingService from "./trending.service.js";
import SocialService from "./social.service.js";
import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";

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
  if (book.isbn) return `isbn:${book.isbn}`;
  return `T:${(book.title || "").slice(0, 60)}|A:${(book.authors
    ? Array.isArray(book.authors)
      ? book.authors[0]
      : book.author
    : ""
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

/**
 * Compose feed by merging providers and ranking
 */
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
    // call providers (if present)
    const personalCall = types.includes("personal")
      ? safeCall(
          RecommenderService.getPersonalizedPicks,
          userId,
          CANDIDATE_LIMIT
        )
      : Promise.resolve([]);

    const trendingCall = types.includes("trending")
      ? safeCall(TrendingService.getTrendingBooks, CANDIDATE_LIMIT, since)
      : Promise.resolve([]);

    const followingCall = types.includes("following")
      ? safeCall(
          SocialService.getFollowedUsersUpdates,
          userId,
          CANDIDATE_LIMIT,
          since
        )
      : Promise.resolve([]);

    const [personalRaw, trendingRaw, followingRaw] = await Promise.all([
      personalCall,
      trendingCall,
      followingCall,
    ]);

    // Normalize provider items to common structure
    const normalize = (arr, type) =>
      (arr || []).map((item) => {
        // provider may return { book, score, createdAt, reason } OR book document directly
        const book = item && item.book ? item.book : item;
        const createdAt =
          item && (item.createdAt || item.updatedAt)
            ? item.createdAt || item.updatedAt
            : book && (book.updatedAt || book.createdAt)
            ? book.updatedAt || book.createdAt
            : new Date();
        const score =
          typeof (item && item.score) === "number"
            ? item.score
            : item && item.trendingScore
            ? item.trendingScore
            : 0.5;
        return {
          id: uuidv4(),
          type,
          book,
          score,
          createdAt,
          raw: item,
        };
      });

    let items = [
      ...normalize(personalRaw, "personal"),
      ...normalize(trendingRaw, "trending"),
      ...normalize(followingRaw, "following"),
    ];

    // Deduplicate by book key; prefer following over others, then by score
    const map = new Map();
    for (const it of items) {
      const key = normalizeBookKey(it.book);
      if (!key) continue;
      if (!map.has(key)) map.set(key, it);
      else {
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

    // rank
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

    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    const minimalItems = paged.map((it) => {
      const b = it.book || {};
      return {
        id: it.id,
        type: it.type,
        score: it.score,
        rank: it.rank,
        createdAt: it.createdAt,
        reason: it.raw?.reason || null,
        book: {
          _id: b._id,
          externalId: b.externalId,
          title: b.title,
          authors: b.authors || b.author || [],
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
