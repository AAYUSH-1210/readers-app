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
    description: { type: String, default: null },

    // denormalized comment count
    commentsCount: { type: Number, default: 0, index: true },

    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String, default: null },
  },
  { timestamps: true }
);

const Book = mongoose.models.Book || mongoose.model("Book", BookSchema);
export default Book;
