// backend/src/models/ShelfItem.js
import mongoose from "mongoose";

const ShelfItemSchema = new mongoose.Schema(
  {
    shelf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shelf",
      required: true,
      index: true,
    },
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      required: true,
      index: true,
    },
    externalId: {
      type: String,
      required: true,
      index: true,
    },
    note: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Prevent duplicate books inside the same shelf
ShelfItemSchema.index({ shelf: 1, book: 1 }, { unique: true });

const ShelfItem =
  mongoose.models.ShelfItem || mongoose.model("ShelfItem", ShelfItemSchema);

export default ShelfItem;
