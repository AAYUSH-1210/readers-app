import RecommenderService from "../src/services/recommender.service.js";

describe("recommender fallback", () => {
  test("exports getPersonalizedPicks", async () => {
    expect(typeof RecommenderService.getPersonalizedPicks).toBe("function");
  });

  // More integration tests require DB seeding.
});
