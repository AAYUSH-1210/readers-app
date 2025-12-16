// backend/src/routes/follow.routes.js
//
// Follow Routes
//
// Responsibilities:
// - Manage follow/unfollow relationships between users
// - Expose follower and following lists
// - Allow authenticated users to check follow state
//
// Notes:
// - Follow actions are authenticated
// - Follower / following lists are public
// - Side effects (activity + notifications) are handled in controller
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  followUser,
  unfollowUser,
  checkFollow,
  getFollowers,
  getFollowing,
} from "../controllers/follow.controller.js";

const router = express.Router();

/* ======================================================
   POST /api/follow/:userId
====================================================== */
/**
 * Follow a user.
 *
 * Auth required.
 * Fails if:
 * - User does not exist
 * - User attempts to follow themselves
 * - Already following
 */
router.post("/:userId", auth, followUser);

/* ======================================================
   DELETE /api/follow/:userId
====================================================== */
/**
 * Unfollow a user.
 *
 * Auth required.
 * Safe to call even if not following.
 */
router.delete("/:userId", auth, unfollowUser);

/* ======================================================
   GET /api/follow/check/:userId
====================================================== */
/**
 * Check whether the current user follows `userId`.
 *
 * Auth required.
 *
 * Response:
 * - { isFollowing: boolean }
 */
router.get("/check/:userId", auth, checkFollow);

/* ======================================================
   GET /api/follow/followers/:userId
====================================================== */
/**
 * Get followers of a user.
 *
 * Public endpoint.
 */
router.get("/followers/:userId", getFollowers);

/* ======================================================
   GET /api/follow/following/:userId
====================================================== */
/**
 * Get users that a user is following.
 *
 * Public endpoint.
 */
router.get("/following/:userId", getFollowing);

export default router;
