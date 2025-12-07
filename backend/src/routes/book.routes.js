// backend/src/routes/book.routes.js
import express from "express";
import { getBook, listBooks } from "../controllers/book.controller.js";

const router = express.Router();

// GET /api/books? page & limit
router.get("/", listBooks);

// GET /api/books/:externalId
// e.g. /api/books/works/OL82563W  OR /api/books/OL82563W  OR /api/books/%2Fworks%2FOL82563W
router.get("/:externalId", getBook);

export default router;
