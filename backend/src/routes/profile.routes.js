// backend/src/routes/profile.routes.js
//
// Profile Routes
//
// Responsibilities:
// - Update authenticated user's profile
// - Change authenticated user's password
// - Serve public user profile data
// - Serve public profile-related resources (stats, reviews, shelves)
//
// Notes:
// - Authenticated routes are protected by auth middleware
// - Avatar upload uses a two-step middleware pipeline:
//   1) uploadAvatar (multipart parsing)
//   2) uploadToCloudinary (cloud storage)
// - Public routes MUST be ordered from most specific → least specific
//
// Base path:
// - /api/profile
//

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

/* ======================================================
   AUTHENTICATED ROUTES
====================================================== */

/**
 * PATCH /api/profile/update
 *
 * Updates the current user's profile.
 * Supports avatar upload.
 *
 * Middleware order:
 * - auth
 * - uploadAvatar (parse multipart)
 * - uploadToCloudinary (store avatar)
 */
router.patch("/update", auth, uploadAvatar, uploadToCloudinary, updateProfile);

/**
 * PATCH /api/profile/change-password
 *
 * Change current user's password.
 */
router.patch("/change-password", auth, changePassword);

/* ======================================================
   PUBLIC PROFILE ROUTES
====================================================== */
/**
 * IMPORTANT:
 * - Order matters here.
 * - More specific routes MUST come before "/:userId".
 */

/**
 * GET /api/profile/:userId/stats
 *
 * Returns public profile statistics.
 */
router.get("/:userId/stats", getPublicProfileStats);

/**
 * GET /api/profile/:userId/reviews
 *
 * Returns public reviews written by the user.
 */
router.get("/:userId/reviews", getPublicProfileReviews);

/**
 * GET /api/profile/:userId/shelves
 *
 * Returns public shelves created by the user.
 */
router.get("/:userId/shelves", getPublicProfileShelves);

/**
 * GET /api/profile/:userId
 *
 * Returns public profile information.
 * MUST be last to avoid route conflicts.
 */
router.get("/:userId", getPublicProfile);

export default router;
