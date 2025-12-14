import mongoose from "mongoose";

const BookClubMemberSchema = new mongoose.Schema(
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

    role: {
      type: String,
      enum: ["member", "admin"],
      default: "member",
    },
  },
  { timestamps: true }
);

BookClubMemberSchema.index({ club: 1, user: 1 }, { unique: true });

const BookClubMember =
  mongoose.models.BookClubMember ||
  mongoose.model("BookClubMember", BookClubMemberSchema);

export default BookClubMember;
