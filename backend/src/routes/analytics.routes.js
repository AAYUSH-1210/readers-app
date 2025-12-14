import express from "express";
import auth from "../middleware/auth.js";
import {
  getReadingSummary,
  getMonthlyReadingStats,
} from "../controllers/analytics.controller.js";

const router = express.Router();

router.get("/reading/summary", auth, getReadingSummary);
router.get("/reading/monthly", auth, getMonthlyReadingStats);

export default router;
