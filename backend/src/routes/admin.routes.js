import express from "express";
import auth from "../middleware/auth.js";
import adminOnly from "../middleware/adminOnly.js";
import {
  listUsers,
  banUser,
  listReviews,
  softDeleteReview,
  restoreReview,
} from "../controllers/admin.controller.js";

const router = express.Router();

router.use(auth, adminOnly);

/* USERS */
router.get("/users", listUsers);
router.patch("/users/:userId/ban", banUser);

/* REVIEWS */
router.get("/reviews", listReviews);
router.patch("/reviews/:reviewId/delete", softDeleteReview);
router.patch("/reviews/:reviewId/restore", restoreReview);

export default router;
