// backend/scripts/seed-trending.js
// Idempotent seed: will NOT fail on duplicate (user,book) unique index.
// Run from backend folder: node .\scripts\seed-trending.js

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import Book from "../src/models/Book.js";
import User from "../src/models/User.js";
import Review from "../src/models/Review.js";
import Reading from "../src/models/Reading.js";

const MONGO = process.env.MONGO_URI || "mongodb://localhost:27017/readers-app";
const DEFAULT_PASSWORD = "password";

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function genExternalId(prefix = "seed") {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

async function ensureBooks() {
  let books = await Book.find({}).limit(10).lean();
  if (!books || books.length === 0) {
    console.log("No books found — creating sample books...");
    const createPayload = [
      {
        title: "Seed Book A",
        authors: ["Seed Author A"],
        avgRating: 4.2,
        ratingsCount: 10,
        externalId: genExternalId("A"),
      },
      {
        title: "Seed Book B",
        authors: ["Seed Author B"],
        avgRating: 4.0,
        ratingsCount: 8,
        externalId: genExternalId("B"),
      },
      {
        title: "Seed Book C",
        authors: ["Seed Author C"],
        avgRating: 3.9,
        ratingsCount: 5,
        externalId: genExternalId("C"),
      },
      {
        title: "Seed Book D",
        authors: ["Seed Author D"],
        avgRating: 4.5,
        ratingsCount: 20,
        externalId: genExternalId("D"),
      },
    ];
    const created = await Book.insertMany(createPayload);
    books = created.map((b) => b.toObject());
  }
  return await Book.find({ _id: { $in: books.map((b) => b._id) } });
}

async function ensureUsers() {
  let users = await User.find({}).limit(10);
  if (!users || users.length < 3) {
    console.log("Creating seed users...");
    const saltRounds = 10;
    const pwdHash = bcrypt.hashSync(DEFAULT_PASSWORD, saltRounds);

    const payload = [
      {
        name: "SeedUser1",
        email: `seed1+${Date.now()}@test.local`,
        username: `seeduser1_${Date.now()}`,
        passwordHash: pwdHash,
      },
      {
        name: "SeedUser2",
        email: `seed2+${Date.now()}@test.local`,
        username: `seeduser2_${Date.now()}`,
        passwordHash: pwdHash,
      },
      {
        name: "SeedUser3",
        email: `seed3+${Date.now()}@test.local`,
        username: `seeduser3_${Date.now()}`,
        passwordHash: pwdHash,
      },
    ];

    users = await User.insertMany(payload);
  }
  return users;
}

async function safeInsertReviews(candidateReviews) {
  let inserted = 0;
  for (const r of candidateReviews) {
    const exists = await Review.exists({ user: r.user, book: r.book });
    if (!exists) {
      try {
        await Review.create(r);
        inserted++;
      } catch (err) {
        // If some other race causes duplicate, skip and log
        if (err.code === 11000) {
          console.warn("Skipped duplicate review (race):", r.user, r.book);
        } else {
          console.error("Error inserting review:", err);
        }
      }
    }
  }
  return inserted;
}

async function safeInsertReadings(candidateReadings) {
  let inserted = 0;
  for (const rd of candidateReadings) {
    const exists = await Reading.exists({
      user: rd.user,
      book: rd.book,
      status: rd.status,
    });
    if (!exists) {
      try {
        await Reading.create(rd);
        inserted++;
      } catch (err) {
        if (err.code === 11000) {
          console.warn("Skipped duplicate reading (race):", rd.user, rd.book);
        } else {
          console.error("Error inserting reading:", err);
        }
      }
    }
  }
  return inserted;
}

async function main() {
  await mongoose.connect(MONGO, {});
  try {
    const books = await ensureBooks();
    const users = await ensureUsers();
    console.log(`Using ${books.length} books and ${users.length} users.`);

    // Candidate reviews
    const candidateReviews = [];
    for (let i = 0; i < 14; i++) {
      candidateReviews.push({
        externalId: genExternalId("rev"),
        book: books[0]._id,
        user: users[i % users.length]._id,
        rating: 4 + (i % 2),
        text: `Seed review ${i} for ${books[0].title}`,
        createdAt: daysAgo(i % 3),
      });
    }
    for (let i = 0; i < 7; i++) {
      candidateReviews.push({
        externalId: genExternalId("rev"),
        book: books[1]._id,
        user: users[i % users.length]._id,
        rating: 4,
        text: `Seed review ${i} for ${books[1].title}`,
        createdAt: daysAgo(i % 5),
      });
    }

    const insertedReviews = await safeInsertReviews(candidateReviews);
    console.log(
      `Inserted ${insertedReviews} new seed reviews (duplicates skipped).`
    );

    // Candidate readings
    const candidateReadings = [];
    for (let i = 0; i < 10; i++) {
      candidateReadings.push({
        externalId: genExternalId("read"),
        book: books[0]._id,
        user: users[i % users.length]._id,
        status: "started",
        startedAt: daysAgo(i % 2),
        updatedAt: daysAgo(i % 2),
      });
    }
    for (let i = 0; i < 3; i++) {
      candidateReadings.push({
        externalId: genExternalId("read"),
        book: books[1]._id,
        user: users[i % users.length]._id,
        status: "started",
        startedAt: daysAgo(i % 3),
        updatedAt: daysAgo(i % 3),
      });
    }

    const insertedReadings = await safeInsertReadings(candidateReadings);
    console.log(
      `Inserted ${insertedReadings} new seed reading-starts (duplicates skipped).`
    );

    console.log("Seeding complete.");
  } catch (err) {
    console.error("Seed error:", err && err.message ? err.message : err);
    if (err && err.errors) console.error(err.errors);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error("Fatal seed error:", e);
  process.exit(1);
});
