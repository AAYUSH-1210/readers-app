// backend/src/routes/reading.routes.js
//
// Reading Routes
//
// Responsibilities:
// - Manage a user's reading lifecycle for books
// - Add or update reading status (to-read | reading | finished)
// - Fetch reading lists (all or by status)
// - Remove reading entries
//
// Notes:
// - All routes are authenticated
// - One reading entry per user per book
// - Book records are lazily created if missing
//
// Base path:
// - /api/reading
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  addOrUpdateReading,
  getMyReading,
  getMyReadingByStatus,
  removeReading,
} from "../controllers/reading.controller.js";
import { body, param, query, validationResult } from "express-validator";

const router = express.Router();

/* ======================================================
   Validation Helper
====================================================== */
function validate(rules) {
  return async (req, res, next) => {
    for (const rule of rules) {
      await rule.run(req);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map((e) => ({
          field: e.path,
          msg: e.msg,
        })),
      });
    }

    next();
  };
}

/* ======================================================
   POST /api/reading/add
====================================================== */
/**
 * Add or update reading entry for a book.
 *
 * Body:
 * - externalId (required)
 * - status (required): to-read | reading | finished
 * - title, authors, cover (optional)
 */
router.post(
  "/add",
  auth,
  validate([
    body("externalId")
      .notEmpty()
      .withMessage("externalId is required")
      .isString(),

    body("status")
      .notEmpty()
      .isIn(["to-read", "reading", "finished"])
      .withMessage("Invalid reading status"),

    body("title").optional().isString(),
    body("authors").optional().isArray(),
    body("cover").optional().isString(),
  ]),
  addOrUpdateReading
);

/* ======================================================
   GET /api/reading/me
====================================================== */
/**
 * Get all reading entries for the current user.
 */
router.get("/me", auth, getMyReading);

/* ======================================================
   GET /api/reading/status/:status
====================================================== */
/**
 * Get reading entries by status.
 *
 * Params:
 * - status: to-read | reading | finished
 */
router.get(
  "/status/:status",
  auth,
  validate([
    param("status")
      .isIn(["to-read", "reading", "finished"])
      .withMessage("Invalid reading status"),
  ]),
  getMyReadingByStatus
);

/* ======================================================
   DELETE /api/reading/:id
====================================================== */
/**
 * Remove a reading entry.
 */
router.delete(
  "/:id",
  auth,
  validate([param("id").isMongoId().withMessage("Invalid reading entry id")]),
  removeReading
);

export default router;
