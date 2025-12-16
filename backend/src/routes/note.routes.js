// backend/src/routes/note.routes.js
//
// Notes Routes
//
// Responsibilities:
// - Allow users to create personal reading notes
// - Fetch notes by book or by user
// - Update and delete notes (user-owned only)
//
// Notes:
// - All routes require authentication
// - Notes are always private to the owning user
// - Books are referenced via OpenLibrary externalId
//
// Base path:
// - /api/notes
//

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
   POST /api/notes/add
====================================================== */
/**
 * Create a new note for a book.
 *
 * Body:
 * - externalId (required): OpenLibrary book id
 * - content (required): note content
 * - title (optional)
 * - highlight (optional)
 * - pageNumber (optional)
 */
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

/* ======================================================
   GET /api/notes/book/:externalId
====================================================== */
/**
 * Get all notes for a specific book (current user only).
 */
router.get("/book/:externalId", auth, getNotesForBook);

/* ======================================================
   GET /api/notes/my
====================================================== */
/**
 * Get all notes created by the current user.
 */
router.get("/my", auth, getNotesForUser);

/* ======================================================
   PATCH /api/notes/:noteId
====================================================== */
/**
 * Update an existing note.
 */
router.patch(
  "/:noteId",
  auth,
  validate([
    param("noteId").notEmpty().withMessage("noteId required"),
    body("title").optional().isString(),
    body("content").optional().isString(),
    body("highlight").optional().isString(),
    body("pageNumber").optional().isNumeric(),
  ]),
  updateNote
);

/* ======================================================
   DELETE /api/notes/:noteId
====================================================== */
/**
 * Delete a note owned by the current user.
 */
router.delete("/:noteId", auth, deleteNote);

export default router;
