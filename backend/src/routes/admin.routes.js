// backend/src/routes/admin.routes.js
//
// Admin Routes
//
// Responsibilities:
// - Expose admin-only system management endpoints
// - Handle moderation, analytics, and dashboard data
// - Enforce strict admin authorization globally
//
// Access Control:
// - All routes require authentication
// - All routes require admin role (adminOnly middleware)
//
// Notes:
// - No business logic here; controllers only
// - Designed for admin dashboard usage
// - Pagination and filtering handled in controllers

import express from "express";
import auth from "../middleware/auth.js";
import adminOnly from "../middleware/adminOnly.js";
import {
  listUsers,
  banUser,
  listReviews,
  softDeleteReview,
  restoreReview,
  getAdminOverview,
  getAdminGrowth,
} from "../controllers/admin.controller.js";

const router = express.Router();

/* ======================================================
   Global Admin Guard
   All routes below require admin privileges
====================================================== */
router.use(auth, adminOnly);

/* ======================================================
   USERS
====================================================== */

/**
 * GET /api/admin/users
 * List all users (paginated)
 */
router.get("/users", listUsers);

/**
 * PATCH /api/admin/users/:userId/ban
 * Ban or unban a user
 * body: { banned: boolean }
 */
router.patch("/users/:userId/ban", banUser);

/* ======================================================
   REVIEWS (Moderation)
====================================================== */

/**
 * GET /api/admin/reviews
 * List reviews with optional filters
 * query:
 * - deleted=true|false
 */
router.get("/reviews", listReviews);

/**
 * PATCH /api/admin/reviews/:reviewId/delete
 * Soft-delete a review
 */
router.patch("/reviews/:reviewId/delete", softDeleteReview);

/**
 * PATCH /api/admin/reviews/:reviewId/restore
 * Restore a soft-deleted review
 */
router.patch("/reviews/:reviewId/restore", restoreReview);

/* ======================================================
   DASHBOARD & ANALYTICS
====================================================== */

/**
 * GET /api/admin/overview
 * High-level platform statistics
 */
router.get("/overview", getAdminOverview);

/**
 * GET /api/admin/growth
 * Time-series growth analytics
 * query:
 * - days (default 30, max 90)
 */
router.get("/growth", getAdminGrowth);

export default router;
