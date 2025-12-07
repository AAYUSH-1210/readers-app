// backend/src/routes/favorite.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  addFavorite,
  listFavorites,
  removeFavorite,
  checkFavorite,
} from "../controllers/favorite.controller.js";
import { body, param, query, validationResult } from "express-validator";

const router = express.Router();

function validate(rules) {
  return async (req, res, next) => {
    for (let r of rules) await r.run(req);
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({
        errors: errors.array().map((e) => ({ field: e.param, msg: e.msg })),
      });
    next();
  };
}

/* POST /api/favorites/add */
router.post(
  "/add",
  auth,
  validate([
    body("externalId").notEmpty().withMessage("externalId required"),
    body("title").optional().isString(),
    body("authors").optional().isArray(),
    body("cover").optional().isString(),
    body("note").optional().isString(),
  ]),
  addFavorite
);

/* GET /api/favorites/list */
router.get("/list", auth, listFavorites);

/* DELETE /api/favorites/:id */
router.delete(
  "/:id",
  auth,
  validate([param("id").notEmpty().withMessage("id required")]),
  removeFavorite
);

/* GET /api/favorites/check?externalId=... */
router.get(
  "/check",
  auth,
  validate([
    query("externalId").notEmpty().withMessage("externalId required in query"),
  ]),
  checkFavorite
);

export default router;
