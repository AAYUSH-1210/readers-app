import mongoose from "mongoose";

const UserBookInteractionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },

    // rating: 1–5 (optional)
    rating: { type: Number, min: 1, max: 5 },

    // weight for user preference (auto-calculated)
    weight: { type: Number, default: 1 },
  },
  { timestamps: true }
);

UserBookInteractionSchema.index({ user: 1, book: 1 }, { unique: true });

export default mongoose.model("UserBookInteraction", UserBookInteractionSchema);
