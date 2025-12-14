import express from "express";
import auth from "../middleware/auth.js";
import {
  getReadingSummary,
  getMonthlyReadingStats,
  getReadingStreaks,
  getReadingHeatmap,
} from "../controllers/analytics.controller.js";

const router = express.Router();

router.get("/reading/summary", auth, getReadingSummary);
router.get("/reading/monthly", auth, getMonthlyReadingStats);
router.get("/reading/streaks", auth, getReadingStreaks);
router.get("/heatmap", auth, getReadingHeatmap);

export default router;
