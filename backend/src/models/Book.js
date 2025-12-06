// backend/src/models/Book.js
import mongoose from "mongoose";

const BookSchema = new mongoose.Schema(
  {
    externalId: { type: String, required: true, unique: true }, // unique external id
    title: { type: String },
    authors: [{ type: String }],
    cover: { type: String },
    source: { type: String, default: "openlibrary" },
    raw: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// NOTE: no BookSchema.index(...) here — unique is defined inline above

const Book = mongoose.models.Book || mongoose.model("Book", BookSchema);
export default Book;
