// backend/src/routes/comment.routes.js
//
// Comment Routes
//
// Responsibilities:
// - Add comments to books, reviews, or notes
// - Fetch comments for a target (with replies)
// - Update or delete user-owned comments
//
// Supported targetType values:
// - book
// - review
// - note
//
// Notes:
// - Creating, updating, deleting requires authentication
// - Reading comments is public
// - Validation is enforced at route level
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  addComment,
  getCommentsByTarget,
  updateComment,
  deleteComment,
} from "../controllers/comment.controller.js";
import { body, param, validationResult, query } from "express-validator";

const router = express.Router();

/* ======================================================
   Validation helper
====================================================== */
function validate(rules) {
  return async (req, res, next) => {
    for (const r of rules) {
      await r.run(req);
    }
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
   POST /api/comments/add
====================================================== */
/**
 * Add a comment to a target.
 *
 * Body:
 * - targetType: book | review | note (required)
 * - targetId: string (required)
 * - text: string (required)
 * - parent: MongoId (optional, for replies)
 * - externalId: string (optional, for books)
 *
 * Access:
 * - Authenticated users only
 */
router.post(
  "/add",
  auth,
  validate([
    body("targetType").notEmpty().isIn(["book", "review", "note"]),
    body("targetId").notEmpty(),
    body("text").notEmpty().withMessage("text required"),
    body("parent").optional().isMongoId(),
    body("externalId").optional().isString(),
  ]),
  addComment
);

/* ======================================================
   GET /api/comments/:targetType/:targetId
====================================================== */
/**
 * Get comments for a target (paginated).
 *
 * Params:
 * - targetType: book | review | note
 * - targetId
 *
 * Query:
 * - page (default: 1)
 * - limit (default: 20)
 *
 * Access:
 * - Public
 */
router.get(
  "/:targetType/:targetId",
  validate([
    param("targetType").isIn(["book", "review", "note"]),
    param("targetId").notEmpty(),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1 }),
  ]),
  getCommentsByTarget
);

/* ======================================================
   PATCH /api/comments/:id
====================================================== */
/**
 * Update an existing comment.
 *
 * Body:
 * - text (optional)
 *
 * Access:
 * - Owner only
 */
router.patch(
  "/:id",
  auth,
  validate([param("id").isMongoId(), body("text").optional().isString()]),
  updateComment
);

/* ======================================================
   DELETE /api/comments/:id
====================================================== */
/**
 * Soft-delete a comment.
 *
 * Access:
 * - Owner only
 */
router.delete("/:id", auth, validate([param("id").isMongoId()]), deleteComment);

export default router;
