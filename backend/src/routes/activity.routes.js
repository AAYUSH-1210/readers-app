// backend/src/routes/activity.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  getMyActivity,
  getActivityForUser,
  getGlobalActivity,
} from "../controllers/activity.controller.js";

const router = express.Router();

router.get("/my", auth, getMyActivity);

router.get("/user/:userId", auth, getActivityForUser);

// optional: public global feed
router.get("/global", auth, getGlobalActivity);

export default router;
