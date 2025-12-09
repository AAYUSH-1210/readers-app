// backend/scripts/update-trending.js
// Full production-ready updater:
// - calls TrendingService.getTrendingBooks
// - writes trendingScore, trendingAt, trendingMeta into Book docs via bulkWrite
// Usage: node ./scripts/update-trending.js
// Config via env: MONGO_URI, TRENDING_LIMIT, TRENDING_WINDOW_DAYS

import mongoose from "mongoose";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// resolve service/model paths to file:// URLs (works on Windows too)
const trendingPath = join(
  __dirname,
  "..",
  "src",
  "services",
  "trending.service.js"
);
const bookPath = join(__dirname, "..", "src", "models", "Book.js");

const trendingUrl = pathToFileURL(trendingPath).href;
const bookUrl = pathToFileURL(bookPath).href;

const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/readers-app";
const LIMIT = parseInt(process.env.TRENDING_LIMIT || "100", 10);
const WINDOW_DAYS = parseInt(process.env.TRENDING_WINDOW_DAYS || "7", 10);

async function main() {
  console.log(`[update-trending] connecting to mongo -> ${MONGO}`);
  await mongoose.connect(MONGO, {});

  const { default: TrendingService } = await import(trendingUrl);
  const { default: Book } = await import(bookUrl);

  try {
    console.log(
      `[update-trending] computing trending (limit=${LIMIT}, windowDays=${WINDOW_DAYS})`
    );
    const rows = await TrendingService.getTrendingBooks(LIMIT, {
      windowDays: WINDOW_DAYS,
    });

    console.log(`[update-trending] rows returned: ${rows.length}`);

    // Build bulk ops
    const bulkOps = [];
    const now = new Date();
    for (const r of rows) {
      if (!r || !r.book || !r.book._id) continue;
      const bookId = r.book._id;
      const score =
        typeof r.trendingScore === "number" ? r.trendingScore : r.score ?? 0;
      const meta = {
        recentReviews: r.recentReviews ?? 0,
        readingStarts: r.readingStarts ?? 0,
        fallback: !!r.fallback,
      };

      bulkOps.push({
        updateOne: {
          filter: { _id: bookId },
          update: {
            $set: {
              trendingScore: score,
              trendingAt: now,
              trendingMeta: meta,
            },
          },
          upsert: false,
        },
      });
    }

    if (bulkOps.length > 0) {
      console.log(
        `[update-trending] executing bulkWrite (${bulkOps.length} ops)`
      );
      const res = await Book.bulkWrite(bulkOps, { ordered: false });
      console.log("[update-trending] bulkWrite result:", {
        insertedCount: res.insertedCount,
        matchedCount: res.matchedCount,
        modifiedCount: res.modifiedCount,
        upsertedCount: res.upsertedCount,
      });
    } else {
      console.log("[update-trending] no bulk ops to run (no rows).");
    }

    console.log("[update-trending] done.");
    process.exit(0);
  } catch (err) {
    console.error(
      "[update-trending] error:",
      err && err.stack ? err.stack : err
    );
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
    } catch (e) {
      /* ignore */
    }
  }
}

main();
