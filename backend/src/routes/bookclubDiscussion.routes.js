// backend/src/routes/bookclubDiscussion.routes.js
//
// Book Club Discussion Routes
//
// Responsibilities:
// - List discussions for a book club
// - Create a new discussion within a club
// - Fetch a single discussion by ID
//
// Notes:
// - Reading discussions is public for public clubs
// - Private clubs enforce membership checks in controller
// - Creating discussions always requires authentication
//
// Route prefixes used:
// - /api/bookclubs/:clubId/discussions
// - /api/discussions/:id
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  createDiscussion,
  listDiscussions,
  getDiscussion,
} from "../controllers/bookclubDiscussion.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/bookclubs/:clubId/discussions
====================================================== */
/**
 * List discussions for a given book club.
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 20)
 *
 * Access:
 * - Public clubs: anyone
 * - Private clubs: members only (enforced in controller)
 */
router.get("/bookclubs/:clubId/discussions", listDiscussions);

/* ======================================================
   POST /api/bookclubs/:clubId/discussions
====================================================== */
/**
 * Create a new discussion in a book club.
 *
 * Body:
 * - title (required)
 * - body (required)
 * - book (optional)
 * - chapter (optional)
 *
 * Access:
 * - Authenticated club members only
 */
router.post("/bookclubs/:clubId/discussions", auth, createDiscussion);

/* ======================================================
   GET /api/discussions/:id
====================================================== */
/**
 * Fetch a single discussion by ID.
 *
 * Access:
 * - Public if discussion exists
 * - Deleted discussions return 404
 */
router.get("/discussions/:id", getDiscussion);

export default router;
