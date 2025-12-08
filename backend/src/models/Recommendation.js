// backend/src/models/Recommendation.js
import mongoose from "mongoose";

const RecommendationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      unique: true,
    },
    books: [
      {
        bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
        score: Number,
        reason: String, // optional short explanation
      },
    ],
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Recommendation", RecommendationSchema);
