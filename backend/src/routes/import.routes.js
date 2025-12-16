// backend/src/routes/import.routes.js
//
// Import Routes
//
// Responsibilities:
// - Import user-owned data from a previously exported payload
// - Restore reading, shelves, shelf items, notes, and reviews
//
// Notes:
// - Authenticated-only endpoint
// - Import is NON-destructive:
//   - Existing records are preserved
//   - Duplicates are skipped
// - Payload format must match export.controller.js output
//
// Typical use cases:
// - Backup restore
// - Account migration
// - Device sync (future)
//
// Endpoint:
// - POST /api/import/all
//

import express from "express";
import auth from "../middleware/auth.js";
import { importAll } from "../controllers/import.controller.js";

const router = express.Router();

/* ======================================================
   POST /api/import/all
====================================================== */
/**
 * Import all user data from an export payload.
 *
 * Auth required.
 *
 * Body:
 * {
 *   meta: {...},
 *   data: {
 *     reading: [],
 *     shelves: [],
 *     shelfItems: [],
 *     notes: [],
 *     reviews: []
 *   }
 * }
 *
 * Behavior:
 * - Skips duplicates
 * - Preserves ownership
 * - Does not delete existing data
 */
router.post("/all", auth, importAll);

export default router;
