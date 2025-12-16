// backend/src/routes/review.routes.js
//
// Review Routes
//
// Responsibilities:
// - Allow users to create, update, and delete reviews
// - Expose public review listings by book and by user
//
// Notes:
// - Reviews are user-owned
// - One review per user per book (enforced in controller/model)
// - Book is lazily created if missing (OpenLibrary externalId)
//
// Base path:
// - /api/reviews
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  addReview,
  getReviewsByBook,
  getReviewsByUser,
  updateReview,
  deleteReview,
} from "../controllers/review.controller.js";
import { body, param, validationResult } from "express-validator";

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
   POST /api/reviews/add
====================================================== */
/**
 * Create a new review for a book.
 *
 * Body:
 * - externalId (required): OpenLibrary externalId
 * - rating (required): integer 1..5
 * - title, authors, cover (optional book metadata)
 * - text (optional review text)
 *
 * Auth:
 * - Required
 */
router.post(
  "/add",
  auth,
  validate([
    body("externalId").notEmpty().withMessage("externalId is required"),
    body("rating")
      .notEmpty()
      .withMessage("rating is required")
      .isInt({ min: 1, max: 5 })
      .withMessage("rating must be an integer between 1 and 5"),
    body("title").optional().isString(),
    body("authors").optional().isArray(),
    body("cover").optional().isString(),
    body("text").optional().isString(),
  ]),
  addReview
);

/* ======================================================
   GET /api/reviews/book/:externalId
====================================================== */
/**
 * Get reviews for a specific book.
 *
 * Params:
 * - externalId: OpenLibrary externalId
 *
 * Query params:
 * - page (optional)
 * - limit (optional)
 *
 * Auth:
 * - Not required (public)
 */
router.get(
  "/book/:externalId",
  validate([param("externalId").notEmpty().withMessage("externalId required")]),
  getReviewsByBook
);

/* ======================================================
   GET /api/reviews/user/:userId
====================================================== */
/**
 * Get reviews written by a specific user.
 *
 * Params:
 * - userId: Mongo ObjectId
 *
 * Query params:
 * - page (optional)
 * - limit (optional)
 *
 * Auth:
 * - Not required (public)
 */
router.get(
  "/user/:userId",
  validate([param("userId").notEmpty().withMessage("userId required")]),
  getReviewsByUser
);

/* ======================================================
   PATCH /api/reviews/:id
====================================================== */
/**
 * Update an existing review.
 *
 * Params:
 * - id: Review ObjectId
 *
 * Body:
 * - rating (optional, 1..5)
 * - text (optional)
 *
 * Auth:
 * - Required (must be review owner)
 */
router.patch(
  "/:id",
  auth,
  validate([
    param("id").notEmpty().withMessage("id required"),
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("rating must be between 1 and 5"),
    body("text").optional().isString(),
  ]),
  updateReview
);

/* ======================================================
   DELETE /api/reviews/:id
====================================================== */
/**
 * Delete a review.
 *
 * Params:
 * - id: Review ObjectId
 *
 * Auth:
 * - Required (must be review owner)
 */
router.delete(
  "/:id",
  auth,
  validate([param("id").notEmpty().withMessage("id required")]),
  deleteReview
);

export default router;
