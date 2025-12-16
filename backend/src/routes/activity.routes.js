// backend/src/routes/activity.routes.js
//
// Activity Routes
//
// Responsibilities:
// - Expose activity feeds (user, profile, global)
// - Delegate all logic to activity.controller.js
// - Enforce authentication consistently
//
// Notes:
// - Activity = system-generated timeline events (reviews, likes, follows, etc.)
// - No write operations are exposed here
// - Pagination is intentionally NOT applied (bounded in controller)

import express from "express";
import auth from "../middleware/auth.js";
import {
  getMyActivity,
  getActivityForUser,
  getGlobalActivity,
} from "../controllers/activity.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/activity/my
   Returns activity for the currently authenticated user
====================================================== */
router.get("/my", auth, getMyActivity);

/* ======================================================
   GET /api/activity/user/:userId
   Returns public activity for a specific user profile
====================================================== */
router.get("/user/:userId", auth, getActivityForUser);

/* ======================================================
   GET /api/activity/global
   Returns global activity feed (admin / discovery use)
   NOTE:
   - Currently protected by auth
   - Can be made public later if required
====================================================== */
router.get("/global", auth, getGlobalActivity);

export default router;
