// backend/scripts/check-orphan-reviews.js
import mongoose from "mongoose";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// compute absolute paths to model files
const reviewPath = join(__dirname, "..", "src", "models", "Review.js");
const bookPath = join(__dirname, "..", "src", "models", "Book.js");

const reviewUrl = pathToFileURL(reviewPath).href;
const bookUrl = pathToFileURL(bookPath).href;

const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/readers-app";

async function main() {
  const { default: Review } = await import(reviewUrl);
  const { default: Book } = await import(bookUrl);

  await mongoose.connect(MONGO, {});

  console.log("Using Review model from:", reviewPath);
  console.log("Using Book model from:", bookPath);

  const pipeline = [
    {
      $lookup: {
        from: Book.collection.name,
        localField: "bookId",
        foreignField: "_id",
        as: "book",
      },
    },
    { $match: { book: { $size: 0 } } },
    { $project: { _id: 1, bookId: 1, createdAt: 1 } },
    { $limit: 20 },
  ];

  const orphans = await Review.aggregate(pipeline).exec();
  console.log("Sample orphan reviews (<=20):");
  console.log(JSON.stringify(orphans, null, 2));

  const countAgg = await Review.aggregate([
    {
      $lookup: {
        from: Book.collection.name,
        localField: "bookId",
        foreignField: "_id",
        as: "book",
      },
    },
    { $match: { book: { $size: 0 } } },
    { $count: "total" },
  ]).exec();

  console.log("Total orphan reviews count:", countAgg[0]?.total || 0);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
