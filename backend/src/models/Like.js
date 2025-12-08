// backend/src/models/Like.js
import mongoose from "mongoose";

const LikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ["book", "review", "note", "comment", "shelfItem"],
      required: true,
      index: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

// prevent duplicate likes by same user on same target
LikeSchema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });

const Like = mongoose.models.Like || mongoose.model("Like", LikeSchema);
export default Like;
