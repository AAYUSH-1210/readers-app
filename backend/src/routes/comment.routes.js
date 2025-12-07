// backend/src/routes/comment.routes.js
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

function validate(rules) {
  return async (req, res, next) => {
    for (const r of rules) await r.run(req);
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res
        .status(400)
        .json({
          errors: errors.array().map((e) => ({ field: e.param, msg: e.msg })),
        });
    next();
  };
}

/* Add comment */
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

/* Get comments for a target (paginated) */
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

/* Update */
router.patch(
  "/:id",
  auth,
  validate([param("id").isMongoId(), body("text").optional().isString()]),
  updateComment
);

/* Delete */
router.delete("/:id", auth, validate([param("id").isMongoId()]), deleteComment);

export default router;
