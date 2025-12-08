// backend/src/models/Notification.js
import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    type: {
      type: String,
      enum: ["follow", "like", "reply"],
      required: true,
    },

    targetType: {
      type: String,
      enum: ["book", "review", "note", "comment", "none"],
      default: "none",
    },

    targetId: { type: mongoose.Schema.Types.ObjectId },

    message: { type: String, required: true },

    seen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", NotificationSchema);

export default Notification;
