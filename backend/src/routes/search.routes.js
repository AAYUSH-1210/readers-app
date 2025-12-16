// backend/src/routes/search.routes.js
//
// Search Routes
//
// Responsibilities:
// - Provide unified search for books and users
// - Use local database as primary source
// - Fallback to OpenLibrary for books when needed
//
// Notes:
// - All endpoints are PUBLIC (no auth required)
// - Pagination is supported for book search via query params
// - User search is limited to basic public profile fields
//
// Base path:
// - /api/search
//

import express from "express";
import { searchBooks, searchUsers } from "../controllers/search.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/search
====================================================== */
/**
 * Search books by title or author.
 *
 * Query params:
 * - q (required): search keyword
 * - page (optional, default = 1)
 *
 * Behavior:
 * - Searches local DB first
 * - Falls back to OpenLibrary if results are insufficient
 *
 * Auth:
 * - Not required (public)
 */
router.get("/", searchBooks);

/* ======================================================
   GET /api/search/users
====================================================== */
/**
 * Search users by username or name.
 *
 * Query params:
 * - q (required): search keyword
 *
 * Returns:
 * - Public user info only (username, name, avatarUrl)
 *
 * Auth:
 * - Not required (public)
 */
router.get("/users", searchUsers);

export default router;
