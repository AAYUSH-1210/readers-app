// backend/src/models/Reading.js
import mongoose from "mongoose";

const ReadingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    book: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
    status: {
      type: String,
      enum: ["to-read", "reading", "finished"],
      default: "to-read",
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    notes: { type: String, default: "" },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true }
);

// Prevent the same book being added multiple times for same user
ReadingSchema.index({ user: 1, book: 1 }, { unique: true });

const Reading =
  mongoose.models.Reading || mongoose.model("Reading", ReadingSchema);
export default Reading;
