// backend/src/routes/shelf.routes.js
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

function validate(rules) {
  return async (req, res, next) => {
    for (const r of rules) await r.run(req);
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({
        errors: errors.array().map((e) => ({ field: e.param, msg: e.msg })),
      });
    next();
  };
}

const router = express.Router();

/* SHELF CRUD */

router.post(
  "/create",
  auth,
  validate([body("name").notEmpty().withMessage("Name required")]),
  createShelf
);

router.get("/my", auth, listMyShelves);

router.get("/:shelfId", auth, getShelf);

router.patch(
  "/:shelfId",
  auth,
  validate([
    body("name").optional().isString(),
    body("description").optional().isString(),
  ]),
  updateShelf
);

router.delete("/:shelfId", auth, deleteShelf);

/* SHELF ITEMS */

router.post(
  "/:shelfId/add",
  auth,
  validate([body("externalId").notEmpty().withMessage("externalId required")]),
  addBookToShelf
);

router.get("/:shelfId/items", auth, listShelfItems);

router.delete("/item/:itemId", auth, removeBookFromShelf);

export default router;
