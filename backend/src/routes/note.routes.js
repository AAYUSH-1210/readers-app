// backend/src/routes/note.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  addNote,
  getNotesForBook,
  getNotesForUser,
  updateNote,
  deleteNote,
} from "../controllers/note.controller.js";

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

router.post(
  "/add",
  auth,
  validate([
    body("externalId").notEmpty().withMessage("externalId required"),
    body("content").notEmpty().withMessage("content is required"),
    body("title").optional().isString(),
    body("highlight").optional().isString(),
    body("pageNumber").optional().isNumeric(),
  ]),
  addNote
);

router.get("/book/:externalId", auth, getNotesForBook);

router.get("/my", auth, getNotesForUser);

router.patch(
  "/:noteId",
  auth,
  validate([
    param("noteId").notEmpty(),
    body("title").optional(),
    body("content").optional(),
    body("highlight").optional(),
    body("pageNumber").optional().isNumeric(),
  ]),
  updateNote
);

router.delete("/:noteId", auth, deleteNote);

export default router;
