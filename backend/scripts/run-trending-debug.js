// backend/scripts/run-trending-debug.js
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const servicePath = join(
  __dirname,
  "..",
  "src",
  "services",
  "trending.service.js"
);
const serviceUrl = pathToFileURL(servicePath).href;

const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/readers-app";

async function main() {
  try {
    console.log("Connecting to Mongo ->", MONGO);
    await mongoose.connect(MONGO, {});
    const { default: TrendingService } = await import(serviceUrl);

    console.log(
      "Calling TrendingService.getTrendingBooks(limit=50, { windowDays: 7 })..."
    );
    const rows = await TrendingService.getTrendingBooks(50, { windowDays: 7 });

    console.log("--- RAW trending results (count):", rows.length);
    console.log(JSON.stringify(rows.slice(0, 20), null, 2));
    await mongoose.disconnect();
    console.log("Done.");
  } catch (err) {
    console.error("Debug script error (full):");
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

main();
