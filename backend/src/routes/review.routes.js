// backend/src/routes/review.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  addReview,
  getReviewsByBook,
  getReviewsByUser,
  updateReview,
  deleteReview,
} from "../controllers/review.controller.js";
import { body, param, validationResult, query } from "express-validator";

const router = express.Router();

/* small validator helper */
function validate(rules) {
  return async (req, res, next) => {
    for (let r of rules) await r.run(req);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res
        .status(400)
        .json({
          errors: errors.array().map((e) => ({ field: e.param, msg: e.msg })),
        });
    }
    next();
  };
}

/* POST /api/reviews/add */
router.post(
  "/add",
  auth,
  validate([
    body("externalId").notEmpty().withMessage("externalId is required"),
    body("rating")
      .notEmpty()
      .withMessage("rating is required")
      .isInt({ min: 1, max: 5 })
      .withMessage("rating must be integer 1..5"),
    body("title").optional().isString(),
    body("authors").optional().isArray(),
    body("cover").optional().isString(),
    body("text").optional().isString(),
  ]),
  addReview
);

/* GET /api/reviews/book/:externalId */
router.get(
  "/book/:externalId",
  validate([param("externalId").notEmpty().withMessage("externalId required")]),
  getReviewsByBook
);

/* GET /api/reviews/user/:userId */
router.get(
  "/user/:userId",
  validate([param("userId").notEmpty().withMessage("userId required")]),
  getReviewsByUser
);

/* PATCH /api/reviews/:id */
router.patch(
  "/:id",
  auth,
  validate([
    param("id").notEmpty().withMessage("id required"),
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("rating must be 1..5"),
    body("text").optional().isString(),
  ]),
  updateReview
);

/* DELETE /api/reviews/:id */
router.delete(
  "/:id",
  auth,
  validate([param("id").notEmpty().withMessage("id required")]),
  deleteReview
);

export default router;
