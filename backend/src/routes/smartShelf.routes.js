// backend/src/routes/smartShelf.routes.js
//
// Smart Shelf Routes
//
// Responsibilities:
// - Expose derived / virtual shelves computed from user activity
// - Provide a unified read-only view across Reading, Favorites, Reviews
//
// Smart Shelves Supported:
// - finished
// - reading
// - to-read
// - favorites
// - recent
// - top-rated
//
// Notes:
// - Smart shelves are NOT persisted in DB
// - All results are computed dynamically
// - ALL routes require authentication
//
// Base path:
// - /api/smart-shelves
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  getAvailableShelves,
  getSmartShelfItems,
} from "../controllers/smartShelf.controller.js";
import { param, validationResult } from "express-validator";

const router = express.Router();

/* ======================================================
   Validator Helper
====================================================== */
function validate(rules) {
  return async (req, res, next) => {
    for (const r of rules) await r.run(req);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map((e) => ({
          field: e.param,
          msg: e.msg,
        })),
      });
    }
    next();
  };
}

/* ======================================================
   GET /api/smart-shelves
====================================================== */
/**
 * Returns available smart shelf types with summary metadata.
 *
 * Response example:
 * {
 *   shelves: [
 *     { key: "finished", title: "Finished", count: 12 },
 *     { key: "reading", title: "Reading", count: 3 },
 *     { key: "favorites", title: "Favorites", count: 7 }
 *   ]
 * }
 */
router.get("/", auth, getAvailableShelves);

/* ======================================================
   GET /api/smart-shelves/:type
====================================================== */
/**
 * Returns paginated items for a smart shelf.
 *
 * Params:
 * - type (required):
 *   finished | reading | to-read | favorites | recent | top-rated
 *
 * Query:
 * - page (default 1)
 * - limit (default 20, max 100)
 */
router.get(
  "/:type",
  auth,
  validate([
    param("type")
      .notEmpty()
      .withMessage("type is required")
      .isIn([
        "finished",
        "reading",
        "to-read",
        "favorites",
        "recent",
        "top-rated",
      ])
      .withMessage("Invalid smart shelf type"),
  ]),
  getSmartShelfItems
);

export default router;
