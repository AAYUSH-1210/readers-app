// backend/src/routes/feed.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import { getFeed } from "../controllers/feed.controller.js";

const router = express.Router();

router.get("/", auth, getFeed);

export default router;
