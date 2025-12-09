// backend/scripts/seed-reviews-only.js
// Inserts a few new seed users and recent reviews for top books.
// Safe: creates new users so it won't conflict with existing (user,book) unique index.
// Run: node .\scripts\seed-reviews-only.js

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Book from "../src/models/Book.js";
import User from "../src/models/User.js";
import Review from "../src/models/Review.js";

const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/readers-app";
const DEFAULT_PASSWORD = "password";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function genExternalId(prefix = "r") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function main() {
  await mongoose.connect(MONGO, {});

  try {
    const books = await Book.find({}).limit(5);
    if (!books || books.length === 0) {
      console.error(
        "No books found. Please create books first (or run the full seed that creates books)."
      );
      return process.exit(1);
    }

    // create 3 new users to avoid unique-index conflicts
    const saltRounds = 10;
    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, saltRounds);
    const now = Date.now();
    const newUsers = await User.insertMany([
      {
        name: `SeedTemp1`,
        email: `seedtemp1+${now}@test.local`,
        username: `seedtemp1_${now}`,
        passwordHash,
      },
      {
        name: `SeedTemp2`,
        email: `seedtemp2+${now}@test.local`,
        username: `seedtemp2_${now}`,
        passwordHash,
      },
      {
        name: `SeedTemp3`,
        email: `seedtemp3+${now}@test.local`,
        username: `seedtemp3_${now}`,
        passwordHash,
      },
    ]);
    console.log(
      "Created temp users:",
      newUsers.map((u) => u._id.toString())
    );

    // insert recent reviews for books[0] and books[1]
    const reviews = [];
    for (let i = 0; i < 9; i++) {
      reviews.push({
        externalId: genExternalId("r"),
        book: books[0]._id,
        user: newUsers[i % newUsers.length]._id,
        rating: 4 + (i % 2),
        text: `Temp seed review ${i} for ${books[0].title}`,
        createdAt: daysAgo(i % 3),
      });
    }
    for (let i = 0; i < 5; i++) {
      reviews.push({
        externalId: genExternalId("r"),
        book: books[1 % books.length]._id,
        user: newUsers[i % newUsers.length]._id,
        rating: 4,
        text: `Temp seed review ${i} for ${books[1 % books.length].title}`,
        createdAt: daysAgo(i % 4),
      });
    }

    const inserted = await Review.insertMany(reviews);
    console.log("Inserted reviews:", inserted.length);

    console.log("Done. Disconnecting.");
  } catch (err) {
    console.error("Seed reviews error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

main();
