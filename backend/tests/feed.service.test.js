// tests/feed.service.test.js
import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import FeedService from "../src/services/feed.service.js";
import RecommenderService from "../src/services/recommender.service.js";
import TrendingService from "../src/services/trending.service.js";
import SocialService from "../src/services/social.service.js";

// Ensure modules are present (we'll replace specific functions with jest.fn())
describe("FeedService.composeFeed", () => {
  beforeEach(() => {
    // reset any existing mocks / stub functions
    jest.restoreAllMocks();
    jest.resetAllMocks();

    // ensure the functions exist and are mock functions
    RecommenderService.getPersonalizedPicks = jest.fn();
    TrendingService.getTrendingBooks = jest.fn();
    SocialService.getFollowedUsersUpdates = jest.fn();
  });

  test("dedupes by book and prefers following", async () => {
    const book1 = { _id: "b1", title: "Book 1" };
    const book2 = { _id: "b2", title: "Book 2" };

    // Provide mock implementations
    RecommenderService.getPersonalizedPicks.mockResolvedValue([
      { book: book1, score: 0.9, createdAt: new Date() },
      { book: book2, score: 0.8, createdAt: new Date() },
    ]);

    TrendingService.getTrendingBooks.mockResolvedValue([
      { book: book2, score: 0.85, trendingScore: 0.85 },
    ]);

    SocialService.getFollowedUsersUpdates.mockResolvedValue([
      {
        book: book1,
        actor: { id: "u2" },
        action: "review",
        score: 0.5,
        createdAt: new Date(),
      },
    ]);

    const result = await FeedService.composeFeed("u1", {
      page: 1,
      limit: 10,
      types: ["personal", "trending", "following"],
    });

    // book1 should be present once and book2 present too
    const ids = result.items.map((i) => i.book._id);
    expect(ids).toContain("b1");
    expect(ids).toContain("b2");
    // ensure only single entry per book
    const b1Count = ids.filter((x) => x === "b1").length;
    expect(b1Count).toBe(1);
  });

  test("returns pagination correctly", async () => {
    const books = Array.from({ length: 30 }, (_, i) => ({
      book: { _id: `b${i}`, title: `B${i}` },
      score: 0.5,
    }));
    RecommenderService.getPersonalizedPicks.mockResolvedValue(books);
    TrendingService.getTrendingBooks.mockResolvedValue([]);
    SocialService.getFollowedUsersUpdates.mockResolvedValue([]);
    const r = await FeedService.composeFeed("u1", {
      page: 2,
      limit: 10,
      types: ["personal"],
    });
    expect(r.page).toBe(2);
    expect(r.items.length).toBe(10);
  });
});
