// backend/tests/recommender.service.test.js
import recommender from "../src/services/recommender.service.js";

describe("recommender service (smoke)", () => {
  test("getPersonalizedPicks returns array", async () => {
    const out = await recommender.getPersonalizedPicks(null, 3);
    expect(Array.isArray(out)).toBe(true);
  }, 20000);
});
