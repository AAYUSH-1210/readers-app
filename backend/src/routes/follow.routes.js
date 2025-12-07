// backend/src/routes/follow.routes.js
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

/* Follow / Unfollow */
router.post("/:userId", auth, followUser);
router.delete("/:userId", auth, unfollowUser);

/* Check follow */
router.get("/check/:userId", auth, checkFollow);

/* Lists */
router.get("/followers/:userId", getFollowers);
router.get("/following/:userId", getFollowing);

export default router;
