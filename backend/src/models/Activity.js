// backend/src/models/Activity.js
import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema(
  {
    // The user this activity belongs to (required to keep compatibility
    // with existing code that expects activity.user)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Optional actor (the user who performed the action). Useful for feed entries.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      index: true,
    },

    // activity domain/type
    type: {
      type: String,
      enum: [
        "reading",
        "review",
        "favorite",
        "shelf",
        "note",
        "follow",
        "like",
        "comment",
        "reaction",
        "recommendation",
        "system",
        "other",
      ],
      required: true,
      index: true,
    },

    // action performed
    action: {
      type: String,
      enum: [
        "created",
        "updated",
        "deleted",
        "started",
        "finished",
        "progress",
        "added",
        "removed",
        "liked",
        "unliked",
      ],
      required: true,
      index: true,
    },

    // optional reference to a book (if relevant)
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      default: null,
      required: false,
      index: true,
    },

    // free-form metadata (e.g., { targetType, targetId, commentId })
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // optional short human-friendly message
    message: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// helpful indexes for feed queries
ActivitySchema.index({ actor: 1, createdAt: -1 });
ActivitySchema.index({ user: 1, createdAt: -1 });
ActivitySchema.index({ type: 1, createdAt: -1 });

const Activity =
  mongoose.models.Activity || mongoose.model("Activity", ActivitySchema);
export default Activity;
