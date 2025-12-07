// backend/src/models/Favorite.js
import mongoose from "mongoose";

const FavoriteSchema = new mongoose.Schema(
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
    externalId: { type: String, required: true, index: true },
    note: { type: String, default: "" }, // optional note user can add
  },
  { timestamps: true }
);

// unique per user+book
FavoriteSchema.index({ user: 1, book: 1 }, { unique: true });

const Favorite =
  mongoose.models.Favorite || mongoose.model("Favorite", FavoriteSchema);
export default Favorite;
