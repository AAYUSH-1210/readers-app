import User from "../models/User.js";
import bcrypt from "bcrypt";

/* ========== Update Profile (name, username, bio, avatarUrl) ========== */
export async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, username, bio } = req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;

    // avatar from Cloudinary?
    if (req.avatarUrl) {
      updateData.avatarUrl = req.avatarUrl;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
    }).select("-passwordHash");

    res.json({ user: updatedUser });
  } catch (err) {
    next(err);
  }
}

/* ========== Change Password ========== */
export async function changePassword(req, res, next) {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;

    const user = await User.findById(userId);

    const match = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!match) {
      return res.status(400).json({ message: "Old password incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    next(err);
  }
}

/* ========== Get Public Profile ========== */
export async function getPublicProfile(req, res, next) {
  try {
    const userId = req.params.userId;

    const user = await User.findById(userId).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (err) {
    next(err);
  }
}
