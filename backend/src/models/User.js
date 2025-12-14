// backend/src/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, unique: true },
    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    bio: { type: String, default: "" },
    lastFeedSeen: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.index({ username: 1 });
userSchema.index({ name: 1 });

// Optional: helper to format returned user object
userSchema.methods.toClient = function () {
  const u = this.toObject();
  delete u.passwordHash;
  return u;
};

const User = mongoose.model("User", userSchema);
export default User;
