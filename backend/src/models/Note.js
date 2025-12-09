// backend/src/models/Note.js
import mongoose from "mongoose";

const NoteSchema = new mongoose.Schema(
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

    externalId: {
      type: String,
      required: true,
      index: true,
    },

    title: {
      type: String,
      default: "",
      trim: true,
    },

    content: {
      type: String,
      required: true,
    },

    highlight: {
      type: String,
      default: "",
    },

    pageNumber: {
      type: Number,
      default: null,
    },

    // denormalized comment count
    commentsCount: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

const Note = mongoose.models.Note || mongoose.model("Note", NoteSchema);
export default Note;
