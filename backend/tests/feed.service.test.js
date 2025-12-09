// backend/tests/feed.service.test.js
import { jest } from "@jest/globals";

let FeedService;
let RecommenderService;
let TrendingService;
let SocialService;
let CacheWrapper;

beforeEach(async () => {
  jest.resetModules();

  // Mock recommender service
  await jest.unstable_mockModule(
    "../src/services/recommender.service.js",
    () => {
      return {
        default: {
          getPersonalizedPicks: jest.fn(),
          getUserTasteVector: jest.fn(),
        },
        getPersonalizedPicks: jest.fn(),
        getUserTasteVector: jest.fn(),
      };
    }
  );

  // Mock trending service
  await jest.unstable_mockModule("../src/services/trending.service.js", () => {
    return {
      default: {
        getTrendingBooks: jest.fn(),
      },
      getTrendingBooks: jest.fn(),
    };
  });

  // Mock social service
  await jest.unstable_mockModule("../src/services/social.service.js", () => {
    return {
      default: {
        getFollowedUsersUpdates: jest.fn(),
      },
      getFollowedUsersUpdates: jest.fn(),
    };
  });

  // Mock cache wrapper so no real Redis is used
  await jest.unstable_mockModule("../src/services/cacheWrapper.js", () => {
    const noop = async () => null;
    return {
      cacheGet: jest.fn().mockImplementation(async (k) => null),
      cacheSet: jest.fn().mockImplementation(async (k, v, ttl) => {}),
      default: {
        cacheGet: jest.fn().mockImplementation(async (k) => null),
        cacheSet: jest.fn().mockImplementation(async (k, v, ttl) => {}),
      },
    };
  });

  // Import service under test AFTER mocks are registered
  FeedService = (await import("../src/services/feed.service.js")).default;

  // Grab mocked modules to configure return values in tests
  RecommenderService = await import("../src/services/recommender.service.js");
  TrendingService = await import("../src/services/trending.service.js");
  SocialService = await import("../src/services/social.service.js");
  CacheWrapper = await import("../src/services/cacheWrapper.js");
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("FeedService.composeFeed", () => {
  test("dedupes by book and prefers following", async () => {
    const book1 = { _id: "b1", title: "Book 1" };
    const book2 = { _id: "b2", title: "Book 2" };

    // Configure mocked implementations
    RecommenderService.default.getPersonalizedPicks.mockResolvedValue([
      { book: book1, score: 0.9, createdAt: new Date() },
      { book: book2, score: 0.8, createdAt: new Date() },
    ]);

    TrendingService.default.getTrendingBooks.mockResolvedValue([
      { book: book2, score: 0.85, trendingScore: 0.85 },
    ]);

    SocialService.default.getFollowedUsersUpdates.mockResolvedValue([
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

    const ids = result.items.map((i) => i.book._id);
    expect(ids).toContain("b1");
    expect(ids).toContain("b2");
    const b1Count = ids.filter((x) => x === "b1").length;
    expect(b1Count).toBe(1);
  }, 20000); // 20s timeout

  test("returns pagination correctly", async () => {
    const books = Array.from({ length: 30 }, (_, i) => ({
      book: { _id: `b${i}`, title: `B${i}` },
      score: 0.5,
    }));

    RecommenderService.default.getPersonalizedPicks.mockResolvedValue(books);
    TrendingService.default.getTrendingBooks.mockResolvedValue([]);
    SocialService.default.getFollowedUsersUpdates.mockResolvedValue([]);

    const r = await FeedService.composeFeed("u1", {
      page: 2,
      limit: 10,
      types: ["personal"],
    });

    expect(r.page).toBe(2);
    expect(r.items.length).toBe(10);
  }, 20000); // 20s timeout
});
