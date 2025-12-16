// backend/src/routes/shelf.routes.js
//
// Shelf Routes
//
// Responsibilities:
// - Manage user-created shelves (CRUD)
// - Add / remove books from shelves
// - Enforce shelf ownership (user-scoped)
//
// Notes:
// - ALL routes require authentication
// - Shelf names are unique per user (enforced at model level)
// - Books are lazily created via externalId when needed
//
// Base path:
// - /api/shelves
//

import express from "express";
import auth from "../middleware/auth.js";
import {
  createShelf,
  listMyShelves,
  getShelf,
  updateShelf,
  deleteShelf,
  addBookToShelf,
  listShelfItems,
  removeBookFromShelf,
} from "../controllers/shelf.controller.js";
import { body, param, validationResult } from "express-validator";

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
   SHELF CRUD
====================================================== */

/**
 * POST /api/shelves/create
 * Create a new shelf for the current user.
 *
 * Body:
 * - name (required)
 * - description (optional)
 */
router.post(
  "/create",
  auth,
  validate([body("name").notEmpty().withMessage("Name required")]),
  createShelf
);

/**
 * GET /api/shelves/my
 * List all shelves owned by the current user.
 */
router.get("/my", auth, listMyShelves);

/**
 * GET /api/shelves/:shelfId
 * Get a single shelf (owner-only).
 */
router.get(
  "/:shelfId",
  auth,
  validate([param("shelfId").isMongoId().withMessage("Invalid shelfId")]),
  getShelf
);

/**
 * PATCH /api/shelves/:shelfId
 * Update shelf name or description.
 */
router.patch(
  "/:shelfId",
  auth,
  validate([
    param("shelfId").isMongoId().withMessage("Invalid shelfId"),
    body("name").optional().isString(),
    body("description").optional().isString(),
  ]),
  updateShelf
);

/**
 * DELETE /api/shelves/:shelfId
 * Delete a shelf and all its items.
 */
router.delete(
  "/:shelfId",
  auth,
  validate([param("shelfId").isMongoId().withMessage("Invalid shelfId")]),
  deleteShelf
);

/* ======================================================
   SHELF ITEMS
====================================================== */

/**
 * POST /api/shelves/:shelfId/add
 * Add a book to a shelf.
 *
 * Body:
 * - externalId (required)
 * - title, authors, cover (optional)
 */
router.post(
  "/:shelfId/add",
  auth,
  validate([
    param("shelfId").isMongoId().withMessage("Invalid shelfId"),
    body("externalId").notEmpty().withMessage("externalId required"),
  ]),
  addBookToShelf
);

/**
 * GET /api/shelves/:shelfId/items
 * List all items in a shelf.
 */
router.get(
  "/:shelfId/items",
  auth,
  validate([param("shelfId").isMongoId().withMessage("Invalid shelfId")]),
  listShelfItems
);

/**
 * DELETE /api/shelves/item/:itemId
 * Remove a book from a shelf.
 */
router.delete(
  "/item/:itemId",
  auth,
  validate([param("itemId").isMongoId().withMessage("Invalid itemId")]),
  removeBookFromShelf
);

export default router;
