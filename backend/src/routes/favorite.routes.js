// backend/src/routes/favorite.routes.js
//
// Favorite Routes
//
// Responsibilities:
// - Manage user's favorite books
// - Allow adding/removing favorites
// - List favorites
// - Check if a book is favorited
//
// Notes:
// - All routes require authentication
// - Books are identified using OpenLibrary externalId
// - Controller ensures book existence (lazy creation)
//

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
   POST /api/favorites/add
====================================================== */
/**
 * Add a book to the user's favorites.
 *
 * Body:
 * - externalId (required)
 * - title, authors, cover (optional, for lazy book creation)
 * - note (optional)
 */
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

/* ======================================================
   GET /api/favorites/list
====================================================== */
/**
 * List all favorite books for the current user.
 *
 * Query params:
 * - page (optional)
 * - limit (optional)
 */
router.get("/list", auth, listFavorites);

/* ======================================================
   DELETE /api/favorites/:id
====================================================== */
/**
 * Remove a favorite by its favorite ID.
 */
router.delete(
  "/:id",
  auth,
  validate([param("id").notEmpty().withMessage("id required")]),
  removeFavorite
);

/* ======================================================
   GET /api/favorites/check
====================================================== */
/**
 * Check if a book is in the user's favorites.
 *
 * Query:
 * - externalId (required)
 */
router.get(
  "/check",
  auth,
  validate([
    query("externalId").notEmpty().withMessage("externalId required in query"),
  ]),
  checkFavorite
);

export default router;
