// backend/scripts/createTestReview.js
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import Review from "../src/models/Review.js";
import Book from "../src/models/Book.js";
import User from "../src/models/User.js";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  // try to reuse an existing book
  let book = await Book.findOne();
  if (!book) {
    book = await Book.create({ externalId: "/test/OL1M", title: "TEST BOOK" });
    console.log("created book id", book._id.toString());
  } else {
    book = await Book.findById(book._id);
  }

  // create a dummy user document so review.user points to a valid user (optional)
  let user = await User.findOne();
  if (!user) {
    user = await User.create({
      name: "Test User",
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: "TempPass123!",
    });
    console.log("created user id", user._id.toString());
  }

  const review = await Review.create({
    user: user._id,
    book: book._id,
    externalId: book.externalId || "/test/OL1M",
    rating: 5,
    text: "test review for comment endpoint",
  });
  console.log("Created review id:", review._id.toString());
  await mongoose.disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
