// backend/src/routes/like.routes.js
//
// Like Routes
//
// Responsibilities:
// - Toggle likes on supported targets
// - Fetch like counts
// - List likes per target
// - List all likes by the current user
//
// Supported targetTypes:
// - book
// - review
// - note
// - comment
// - shelfItem
//
// Notes:
// - Like toggling is idempotent
// - Duplicate likes are prevented at DB level
// - Side effects (activity, notifications, sockets)
//   are handled in the controller layer
//
// Base path:
// - /api/likes
//

import express from "express";
import auth from "../middleware/auth.js";
import { body, query, validationResult } from "express-validator";
import {
  toggleLike,
  getLikeCount,
  listLikes,
  listMyLikes,
} from "../controllers/like.controller.js";

const router = express.Router();

/* ======================================================
   Validation helper
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
   POST /api/likes/toggle
====================================================== */
/**
 * Toggle like for a target.
 *
 * Auth required.
 *
 * Body:
 * - targetType: book | review | note | comment | shelfItem
 * - targetId: Mongo ObjectId (string)
 *
 * Behavior:
 * - If not liked → creates like
 * - If already liked → removes like
 *
 * Returns:
 * - liked (boolean)
 * - count (number)
 */
router.post(
  "/toggle",
  auth,
  validate([
    body("targetType")
      .notEmpty()
      .isIn(["book", "review", "note", "comment", "shelfItem"]),
    body("targetId").notEmpty().isString(),
  ]),
  toggleLike
);

/* ======================================================
   GET /api/likes/count
====================================================== */
/**
 * Get like count for a target.
 *
 * Query:
 * - targetType
 * - targetId
 */
router.get(
  "/count",
  validate([query("targetType").notEmpty(), query("targetId").notEmpty()]),
  getLikeCount
);

/* ======================================================
   GET /api/likes/list
====================================================== */
/**
 * List users who liked a target.
 *
 * Query:
 * - targetType
 * - targetId
 * - page (optional)
 * - limit (optional)
 */
router.get(
  "/list",
  validate([query("targetType").notEmpty(), query("targetId").notEmpty()]),
  listLikes
);

/* ======================================================
   GET /api/likes/me
====================================================== */
/**
 * List all likes created by the current user.
 *
 * Auth required.
 */
router.get("/me", auth, listMyLikes);

export default router;
