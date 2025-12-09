// backend/src/routes/feed.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  getFeed,
  getPreview,
  markFeedSeen,
} from "../controllers/feed.controller.js";

const router = express.Router();

router.get("/", auth, getFeed);
router.get("/preview", auth, getPreview);
router.post("/mark-seen", auth, markFeedSeen);

export default router;
