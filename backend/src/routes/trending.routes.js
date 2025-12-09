// backend/src/routes/trending.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import { getTrending } from "../controllers/trending.controller.js";

const router = express.Router();

/**
 * GET /api/books/trending
 * Query params:
 *  - limit (default 20)
 *  - window (days, default 7)
 */
router.get("/", auth, getTrending);

export default router;
