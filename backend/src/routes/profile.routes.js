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
} from "../controllers/profile.controller.js";

const router = express.Router();

/* Update profile (text + avatar upload) */
router.patch("/update", auth, uploadAvatar, uploadToCloudinary, updateProfile);

/* Change password */
router.patch("/change-password", auth, changePassword);

/* Get public profile */
router.get("/:userId", getPublicProfile);

export default router;
