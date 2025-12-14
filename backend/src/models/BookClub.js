import mongoose from "mongoose";

const BookClubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    currentBook: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Book",
      default: null,
    },

    isPrivate: { type: Boolean, default: false },

    membersCount: { type: Number, default: 1 },
  },
  { timestamps: true }
);

BookClubSchema.index({ name: 1 });
BookClubSchema.index({ owner: 1 });

const BookClub =
  mongoose.models.BookClub || mongoose.model("BookClub", BookClubSchema);

export default BookClub;
