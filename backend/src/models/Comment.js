// backend/src/models/Comment.js
import mongoose from "mongoose";

const CommentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // allowed: 'book', 'review', 'note'
    targetType: {
      type: String,
      enum: ["book", "review", "note"],
      required: true,
      index: true,
    },

    // reference to Book/Review/Note document id
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // optional store of externalId for books to ease lookups
    externalId: { type: String, default: null, index: true },

    text: { type: String, required: true },

    // allow replies: parent comment id (optional)
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },

    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// compound index to speed up the common query used by getCommentsByTarget
CommentSchema.index({
  targetType: 1,
  targetId: 1,
  parent: 1,
  deleted: 1,
  createdAt: -1,
});

const Comment =
  mongoose.models.Comment || mongoose.model("Comment", CommentSchema);
export default Comment;
