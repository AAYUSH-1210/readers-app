// backend/src/routes/bookclub.routes.js
//
// Book Club Routes
//
// Responsibilities:
// - Create and list book clubs
// - View club details
// - Join / leave clubs
// - List club members
//
// Notes:
// - Public clubs are visible to everyone
// - Private clubs restrict joining and discussion access
// - Authentication required for mutations
//
// Route prefix:
// - /api/bookclubs
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  createClub,
  listPublicClubs,
  getClubDetails,
  joinBookClub,
  leaveBookClub,
  listClubMembers,
} from "../controllers/bookclub.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/bookclubs
====================================================== */
/**
 * List all public book clubs.
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 20)
 */
router.get("/", listPublicClubs);

/* ======================================================
   POST /api/bookclubs
====================================================== */
/**
 * Create a new book club.
 *
 * Body:
 * - name (required)
 * - description (optional)
 * - isPublic (default: true)
 * - book (optional book reference)
 */
router.post("/", auth, createClub);

/* ======================================================
   GET /api/bookclubs/:clubId
====================================================== */
/**
 * Get details of a specific book club.
 */
router.get("/:clubId", getClubDetails);

/* ======================================================
   POST /api/bookclubs/:clubId/join
====================================================== */
/**
 * Join a public book club.
 * - Private clubs reject this request
 */
router.post("/:clubId/join", auth, joinBookClub);

/* ======================================================
   POST /api/bookclubs/:clubId/leave
====================================================== */
/**
 * Leave a book club.
 * - Admin/owner restrictions enforced in controller
 */
router.post("/:clubId/leave", auth, leaveBookClub);

/* ======================================================
   GET /api/bookclubs/:clubId/members
====================================================== */
/**
 * List members of a book club.
 */
router.get("/:clubId/members", listClubMembers);

export default router;
