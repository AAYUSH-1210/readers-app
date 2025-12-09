// backend/scripts/seed-reviews-safe.js
// Idempotent, safe reviews-only seeder (no bulk insert errors).
// Run: node .\scripts\seed-reviews-safe.js

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

async function createTempUsers() {
  // create 3 temp users with unique emails and usernames
  const now = Date.now();
  const pwdHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  const payload = [
    {
      name: `SeedTemp1`,
      email: `seedtemp1+${now}@test.local`,
      username: `seedtemp1_${now}`,
      passwordHash: pwdHash,
    },
    {
      name: `SeedTemp2`,
      email: `seedtemp2+${now}@test.local`,
      username: `seedtemp2_${now}`,
      passwordHash: pwdHash,
    },
    {
      name: `SeedTemp3`,
      email: `seedtemp3+${now}@test.local`,
      username: `seedtemp3_${now}`,
      passwordHash: pwdHash,
    },
  ];
  const docs = await User.insertMany(payload);
  return docs;
}

async function safeInsertReview(r) {
  // check by (user, book) unique constraint -- skip if exists
  const exists = await Review.exists({ user: r.user, book: r.book });
  if (exists) return false;
  try {
    await Review.create(r);
    return true;
  } catch (err) {
    if (err && err.code === 11000) {
      // duplicate race condition — skip
      return false;
    }
    throw err;
  }
}

async function main() {
  await mongoose.connect(MONGO, {});
  try {
    const books = await Book.find({}).limit(5);
    if (!books || books.length === 0) {
      console.error("No books found. Please add books first.");
      process.exit(1);
    }

    // create temp users (always create new ones to avoid duplicates)
    const tempUsers = await createTempUsers();
    console.log(
      "Created temp users:",
      tempUsers.map((u) => u._id.toString())
    );

    // build candidate reviews
    const candidates = [];
    for (let i = 0; i < 9; i++) {
      candidates.push({
        externalId: genExternalId("r"),
        book: books[0]._id,
        user: tempUsers[i % tempUsers.length]._id,
        rating: 4 + (i % 2),
        text: `Temp seed review ${i} for ${books[0].title}`,
        createdAt: daysAgo(i % 3),
      });
    }
    for (let i = 0; i < 5; i++) {
      candidates.push({
        externalId: genExternalId("r"),
        book: books[1 % books.length]._id,
        user: tempUsers[i % tempUsers.length]._id,
        rating: 4,
        text: `Temp seed review ${i} for ${books[1 % books.length].title}`,
        createdAt: daysAgo(i % 4),
      });
    }

    // insert sequentially and count successful inserts
    let inserted = 0;
    for (const r of candidates) {
      const ok = await safeInsertReview(r);
      if (ok) inserted++;
    }
    console.log(`Inserted ${inserted} new reviews (duplicates skipped).`);
  } catch (err) {
    console.error("Seeder error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
