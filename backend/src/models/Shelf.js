// backend/src/models/Shelf.js
import mongoose from "mongoose";

const ShelfSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Prevent the same user creating shelves with duplicate names
ShelfSchema.index({ user: 1, name: 1 }, { unique: true });

const Shelf = mongoose.models.Shelf || mongoose.model("Shelf", ShelfSchema);
export default Shelf;
