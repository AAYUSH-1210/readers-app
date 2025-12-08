// backend/src/routes/like.routes.js
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

/* Toggle like */
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

/* Count */
router.get(
  "/count",
  validate([query("targetType").notEmpty(), query("targetId").notEmpty()]),
  getLikeCount
);

/* List who liked a target */
router.get(
  "/list",
  validate([query("targetType").notEmpty(), query("targetId").notEmpty()]),
  listLikes
);

/* My likes */
router.get("/me", auth, listMyLikes);

export default router;
