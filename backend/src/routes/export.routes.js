// backend/src/routes/export.routes.js
//
// Export Routes
//
// Responsibilities:
// - Export all user-owned data in a single payload
//
// Exported data includes:
// - Reading entries
// - Shelves
// - Shelf items (owned shelves only)
// - Notes
// - Reviews
//
// Notes:
// - Authentication is required
// - This endpoint is intended for backups / data portability
// - Import counterpart exists in import.routes.js
//

import express from "express";
import auth from "../middleware/auth.js";
import { exportAll } from "../controllers/export.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/export/all
====================================================== */
/**
 * Export all data belonging to the authenticated user.
 *
 * Access:
 * - Authenticated users only
 *
 * Response:
 * - JSON payload containing metadata and user data
 */
router.get("/all", auth, exportAll);

export default router;
