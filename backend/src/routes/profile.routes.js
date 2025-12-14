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

/* Authenticated */
router.patch("/update", auth, uploadAvatar, uploadToCloudinary, updateProfile);
router.patch("/change-password", auth, changePassword);

/* Public (ORDER MATTERS) */
router.get("/:userId/stats", getPublicProfileStats);
router.get("/:userId/reviews", getPublicProfileReviews);
router.get("/:userId/shelves", getPublicProfileShelves);
router.get("/:userId", getPublicProfile);

export default router;
