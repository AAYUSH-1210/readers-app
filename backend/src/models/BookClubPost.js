import mongoose from "mongoose";

const BookClubPostSchema = new mongoose.Schema(
  {
    club: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BookClub",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    content: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

BookClubPostSchema.index({ club: 1, createdAt: -1 });

const BookClubPost =
  mongoose.models.BookClubPost ||
  mongoose.model("BookClubPost", BookClubPostSchema);

export default BookClubPost;
