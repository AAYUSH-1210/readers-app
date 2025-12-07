// backend/src/models/Activity.js
import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["reading", "review", "favorite", "shelf", "note"],
      required: true,
    },

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
      ],
      required: true,
    },

    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      default: null,
    },

    meta: {
      type: mongoose.Schema.Types.Mixed, // example: { progress: 30, shelfName: "Motivation" }
      default: {},
    },
  },
  { timestamps: true }
);

const Activity =
  mongoose.models.Activity || mongoose.model("Activity", ActivitySchema);
export default Activity;
