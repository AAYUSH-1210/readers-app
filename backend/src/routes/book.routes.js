// backend/src/routes/book.routes.js
//
// Book Routes
//
// Responsibilities:
// - Fetch a single book by externalId (lazy-load from OpenLibrary if missing)
// - List recently accessed / stored books from local DB
//
// Notes:
// - externalId supports OpenLibrary formats:
//   • /works/OLxxxxW
//   • OLxxxxW
//   • /books/OLxxxxM
// - Book creation is handled lazily inside the controller
//
// Route prefix:
// - /api/books
//

import express from "express";
import { getBook, listBooks } from "../controllers/book.controller.js";

const router = express.Router();

/* ======================================================
   GET /api/books
====================================================== */
/**
 * List books stored in local DB.
 *
 * Query params:
 * - page (default: 1)
 * - limit (default: 20, max enforced in controller)
 */
router.get("/", listBooks);

/* ======================================================
   GET /api/books/:externalId
====================================================== */
/**
 * Fetch a book by externalId.
 *
 * Supported formats:
 * - /api/books/OL82563W
 * - /api/books/works/OL82563W
 * - /api/books/%2Fworks%2FOL82563W
 *
 * Behavior:
 * - Returns existing DB book if found
 * - Otherwise fetches from OpenLibrary and persists it
 */
router.get("/:externalId", getBook);

export default router;
