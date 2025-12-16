// backend/src/controllers/book.controller.js
// Book controller.
//
// Responsibilities:
// - Normalize and resolve OpenLibrary identifiers
// - Fetch book metadata from OpenLibrary (best-effort)
// - Persist normalized books into MongoDB
// - Serve books from the local database
//
// Notes:
// - This is NOT a search endpoint (see search.controller.js)
// - OpenLibrary is treated as an external, best-effort dependency
// - externalId is the canonical deduplication key in the Book collection

import axios from "axios";
import Book from "../models/Book.js";

/**
 * Normalize externalId formats.
 *
 * Supported inputs:
 * - "/works/OL82563W"
 * - "OL82563W"
 * - "/books/OL123M"
 * - "OL123M"
 *
 * Canonical form stored in DB:
 * - "/works/OLxxxxxW" or "/books/OLxxxxxM"
 *
 * IMPORTANT:
 * - This function is central to book deduplication.
 * - Do not modify lightly without migrating existing data.
 */
function normalizeExternalId(externalId) {
  if (!externalId) return null;

  externalId = externalId.trim();

  // Already a path-like identifier
  if (externalId.startsWith("/")) return externalId;

  // Plain OpenLibrary IDs
  if (/^OL.*W$/.test(externalId) || /^OL.*M$/.test(externalId)) {
    // Works (W) vs Editions (M)
    if (externalId.endsWith("W")) {
      return `/works/${externalId}`;
    }
    return `/books/${externalId}`;
  }

  // Fallback: return as-is
  return externalId;
}

/**
 * Fetch book metadata from OpenLibrary.
 *
 * externalId examples:
 * - "/works/OL82563W"
 * - "/books/OL123M"
 *
 * Notes:
 * - Uses OpenLibrary JSON endpoints
 * - Author resolution is best-effort
 * - Failures return null (caller decides response)
 */
async function fetchFromOpenLibrary(externalId) {
  try {
    if (!externalId) return null;

    // Remove leading slash for URL composition
    const id = externalId.replace(/^\/+/, "");

    // Prefer works endpoint when possible
    if (id.startsWith("works/")) {
      const url = `https://openlibrary.org/${id}.json`;
      const r = await axios.get(url);
      const data = r.data;

      // Attempt cover extraction
      let cover = null;
      if (data.covers && data.covers.length) {
        cover = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;
      }

      const title = data.title || null;

      // Attempt author names directly
      const authors = (data.authors || [])
        .map((a) => a.name || null)
        .filter(Boolean);

      // If authors are references, resolve names best-effort
      if (data.authors && data.authors.length && authors.length === 0) {
        const authorFetches = data.authors.map((a) => {
          const key = a.author ? a.author.key : a.key;
          if (!key) return null;
          return axios
            .get(`https://openlibrary.org${key}.json`)
            .then((r) => r.data.name)
            .catch(() => null);
        });

        const authorNames = await Promise.all(authorFetches);
        for (const n of authorNames) {
          if (n) authors.push(n);
        }
      }

      const description =
        (typeof data.description === "string" && data.description) ||
        (data.description && data.description.value) ||
        null;

      const subjects = data.subjects || [];

      return {
        externalId: `/${id}`,
        title,
        authors,
        cover,
        source: "openlibrary",
        raw: { openlibrary: data, subjects },
        description,
      };
    }

    // Editions / books endpoint
    if (id.startsWith("books/") || id.startsWith("OL")) {
      const url = `https://openlibrary.org/${id}.json`;
      const r = await axios.get(url);
      const data = r.data;

      const title = data.title || data.full_title || null;

      const authors =
        (data.authors || [])
          .map((a) => (a.name ? a.name : a.author?.key || null))
          .filter(Boolean) || [];

      let cover = null;
      if (data.covers && data.covers.length) {
        cover = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;
      }

      const description =
        (typeof data.description === "string" && data.description) ||
        (data.description && data.description.value) ||
        null;

      return {
        externalId: `/${id}`,
        title,
        authors,
        cover,
        source: "openlibrary",
        raw: { openlibrary: data },
        description,
      };
    }

    return null;
  } catch {
    // External fetch failures are intentionally silent
    return null;
  }
}

/**
 * Find a book by externalId or create it if missing.
 *
 * Notes:
 * - Assumes externalId uniqueness at the database level
 * - In rare concurrent cases, duplicates may occur without a unique index
 */
async function findOrCreateBook(payload) {
  const { externalId, title, authors, cover, source, raw, description } =
    payload;

  const normalized = normalizeExternalId(externalId);

  let book = await Book.findOne({ externalId: normalized });

  if (!book) {
    book = await Book.create({
      externalId: normalized,
      title,
      authors,
      cover,
      source,
      raw,
      description,
    });
  }

  return book;
}

/* ======================================================
   GET /api/books/:externalId
====================================================== */

/**
 * Returns a Book from the local DB.
 * If not found, attempts to fetch from OpenLibrary and persist it.
 *
 * Supported externalId formats:
 * - /works/OL82563W
 * - OL82563W
 * - /books/OL123M
 */
export async function getBook(req, res, next) {
  try {
    const rawId = req.params.externalId;

    if (!rawId) {
      return res.status(400).json({ message: "externalId required in path" });
    }

    const normalized = normalizeExternalId(rawId);

    // Attempt DB lookup first
    let book = await Book.findOne({
      externalId: normalized,
    });

    if (book) {
      return res.json({ book });
    }

    // Fallback to OpenLibrary fetch
    const fetched = await fetchFromOpenLibrary(normalized);

    if (!fetched) {
      return res.status(404).json({
        message: "Requested book does not exist",
        code: "BOOK_NOT_FOUND",
      });
    }

    book = await findOrCreateBook(fetched);

    return res.status(201).json({
      book,
      fetched: true,
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/books
====================================================== */

/**
 * List recent books stored in the database.
 *
 * Notes:
 * - Intended for admin/debug usage
 * - Not a discovery or search endpoint
 */
export async function listBooks(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const docs = await Book.find()
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Book.countDocuments();

    res.json({ page, limit, total, docs });
  } catch (err) {
    next(err);
  }
}
