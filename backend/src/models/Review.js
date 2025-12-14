// backend/src/models/Review.js
import mongoose from "mongoose";

const ReviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },

    // denormalized comment count
    commentsCount: { type: Number, default: 0, index: true },

    // keep externalId for safe querying when book wasn't resolved, but book ref is authoritative
    externalId: { type: String, required: true, index: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    text: { type: String, default: "" },
    editedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// prevent a user from posting multiple reviews for the same book
ReviewSchema.index({ user: 1, book: 1 }, { unique: true });

const Review = mongoose.models.Review || mongoose.model("Review", ReviewSchema);
export default Review;
