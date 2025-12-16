// backend/src/routes/notification.routes.js
//
// Notification Routes
//
// Responsibilities:
// - Fetch notifications for the current user
// - Mark individual notifications as seen
// - Mark all notifications as seen
//
// Notes:
// - All routes require authentication
// - Notifications are always scoped to the current user
// - Route ordering matters (static routes before dynamic)
//
// Base path:
// - /api/notifications
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  getMyNotifications,
  markAsSeen,
  markAllAsSeen,
} from "../controllers/notification.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/notifications
====================================================== */
/**
 * Fetch all notifications for the current user.
 *
 * Response:
 * - notifications: array (latest first)
 * - unread: number (unseen count)
 */
router.get("/", auth, getMyNotifications);

/* ======================================================
   PATCH /api/notifications/mark-all-seen
====================================================== */
/**
 * Mark all notifications as seen.
 *
 * IMPORTANT:
 * - This static route MUST come before "/:id/seen"
 * - Prevents Express from interpreting "mark-all-seen" as :id
 */
router.patch("/mark-all-seen", auth, markAllAsSeen);

/* ======================================================
   PATCH /api/notifications/:id/seen
====================================================== */
/**
 * Mark a single notification as seen.
 *
 * Params:
 * - id: Notification ObjectId
 */
router.patch("/:id/seen", auth, markAsSeen);

export default router;
