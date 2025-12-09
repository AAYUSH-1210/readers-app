// backend/src/routes/profile.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import uploadAvatar, {
  uploadAvatar as uploadToCloudinary,
} from "../middleware/uploadAvatar.js";
import {
  updateProfile,
  changePassword,
  getPublicProfile,
  getPublicProfileStats,
  getPublicProfileReviews,
  getPublicProfileShelves,
} from "../controllers/profile.controller.js";

const router = express.Router();

/* Update profile (text + avatar upload) */
router.patch("/update", auth, uploadAvatar, uploadToCloudinary, updateProfile);

/* Change password */
router.patch("/change-password", auth, changePassword);

/* Get public profile (identifier = username or userId) */
router.get("/:userId", getPublicProfile);

/* Additional public endpoints */
router.get("/:userId/stats", getPublicProfileStats);
router.get("/:userId/reviews", getPublicProfileReviews);
router.get("/:userId/shelves", getPublicProfileShelves);

export default router;
