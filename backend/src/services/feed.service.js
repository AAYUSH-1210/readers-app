// backend/src/services/feed.service.js
import RecommenderService from "./recommender.service.js"; // your existing recommender
import TrendingService from "./trending.service.js";
import SocialService from "./social.service.js";
import { v4 as uuidv4 } from "uuid";

const CANDIDATE_LIMIT = 120;
const DEFAULT_WEIGHTS = { score: 0.72, recency: 0.28 }; // tune as needed

function recencyBoost(createdAt) {
  // returns value in [0,1], 1 = very recent, decays to 0 by 72 hours
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.max(0, ms / (1000 * 60 * 60));
  const halfLife = 36; // tune
  return Math.max(0, 1 - hours / (halfLife * 2)); // decays to 0 at ~72h
}

function normalizeBookKey(book) {
  // prefer _id, fallback to isbn or title-author
  if (!book) return null;
  if (book._id) return book._id.toString();
  if (book.isbn) return `isbn:${book.isbn}`;
  return `T:${(book.title || "").slice(0, 60)}|A:${(book.author || "").slice(
    0,
    40
  )}`;
}

export default {
  /**
   * Compose feed by calling providers, normalizing, deduping, ranking and paginating.
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
    // fetch candidates in parallel
    const calls = [];
    calls.push(
      types.includes("personal")
        ? RecommenderService.getPersonalizedPicks(userId, CANDIDATE_LIMIT)
        : Promise.resolve([])
    );
    calls.push(
      types.includes("trending")
        ? TrendingService.getTrendingBooks(CANDIDATE_LIMIT, since)
        : Promise.resolve([])
    );
    calls.push(
      types.includes("following")
        ? SocialService.getFollowedUsersUpdates(userId, CANDIDATE_LIMIT, since)
        : Promise.resolve([])
    );

    const [personalRaw, trendingRaw, followingRaw] = await Promise.all(calls);

    // Convert provider outputs to unified FeedItem structure
    const normalize = (arr, type) =>
      (arr || []).map((item) => {
        // services may return wrapper or book directly
        const book = item.book || item;
        const createdAt =
          item.createdAt || item.updatedAt || book.createdAt || new Date();
        // score: providers should return score; fallback to default
        const score =
          typeof item.score === "number"
            ? item.score
            : type === "trending"
            ? item.trendingScore ?? 0.5
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

    // Deduplicate by book key. Preference rules:
    // - Prefer 'following' (social) over other types for same book
    // - Otherwise pick item with higher score
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
          // keep existing following
        } else if ((it.score ?? 0) > (existing.score ?? 0)) {
          map.set(key, it);
        }
      }
    }

    items = Array.from(map.values());

    // Compute rank: combine provider score and recency boost
    items = items.map((it) => {
      const rBoost = recencyBoost(it.createdAt);
      const rank =
        DEFAULT_WEIGHTS.score * (it.score ?? 0) +
        DEFAULT_WEIGHTS.recency * rBoost;
      return { ...it, rank, rBoost };
    });

    // Sort by rank desc, then by createdAt desc
    items.sort((a, b) => {
      if (b.rank !== a.rank) return b.rank - a.rank;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Pagination
    const total = items.length;
    const start = (page - 1) * limit;
    const paged = items.slice(start, start + limit);

    // Return minimal book fields to frontend (avoid huge payloads)
    const minimalItems = paged.map((it) => ({
      id: it.id,
      type: it.type,
      score: it.score,
      rank: it.rank,
      createdAt: it.createdAt,
      reason: it.raw?.reason || null,
      book: {
        _id: it.book._id,
        title: it.book.title,
        authors: it.book.authors || it.book.author,
        coverUrl: it.book.coverUrl || it.book.image,
        avgRating: it.book.avgRating,
        genres: it.book.genres || [],
      },
      meta: {
        providerRaw: it.raw,
      },
    }));

    return { page, limit, total, items: minimalItems };
  },
};
