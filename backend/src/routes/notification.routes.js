// backend/src/routes/notification.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  getMyNotifications,
  markAsSeen,
  markAllAsSeen,
} from "../controllers/notification.controller.js";

const router = express.Router();

// GET /api/notifications
router.get("/", auth, getMyNotifications);

// 🔴 IMPORTANT: static route FIRST
// PATCH /api/notifications/mark-all-seen
router.patch("/mark-all-seen", auth, markAllAsSeen);

// PATCH /api/notifications/:id/seen
router.patch("/:id/seen", auth, markAsSeen);

export default router;
