// backend/src/controllers/book.controller.js
import axios from "axios";
import Book from "../models/Book.js";

/**
 * Normalize externalId formats:
 * Accepts "/works/OL82563W", "OL82563W", "/books/OLID:OL123M", "OLID:OL123M" etc.
 * For now we support /works/... and OL works id (OLxxxxxW).
 */
function normalizeExternalId(externalId) {
  if (!externalId) return null;
  externalId = externalId.trim();
  // if already starts with /works/ or /books/ or /works or /books
  if (externalId.startsWith("/")) return externalId;
  // if plain OL id like OL82563W
  if (/^OL.*W$/.test(externalId) || /^OL.*M$/.test(externalId)) {
    // treat W-type as works path
    if (externalId.endsWith("W")) return `/works/${externalId}`;
    return `/books/${externalId}`;
  }
  // fallback: return as-is
  return externalId;
}

/**
 * Fetch book metadata from OpenLibrary for a given externalId
 * externalId should be like "/works/OL82563W" or "/works/OL82563W.json"
 */
async function fetchFromOpenLibrary(externalId) {
  try {
    if (!externalId) return null;
    const id = externalId.replace(/^\/+/, ""); // remove leading slash
    // prefer works endpoint if it contains "works"
    let url;
    if (id.startsWith("works/")) {
      url = `https://openlibrary.org/${id}.json`;
      const r = await axios.get(url);
      const data = r.data;

      // Try to get a cover (works often reference covers or editions)
      let cover = null;
      if (data.covers && data.covers.length) {
        cover = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;
      }

      const title = data.title || null;
      const authors = (data.authors || [])
        .map((a) => a.name || null)
        .filter(Boolean);

      // If authors are references, try fetching names (best-effort)
      if (data.authors && data.authors.length && authors.length === 0) {
        // fetch author names if author keys are present
        const authorFetches = data.authors.map((a) => {
          const key = a.author ? a.author.key : a.key;
          if (!key) return null;
          return axios
            .get(`https://openlibrary.org${key}.json`)
            .then((r) => r.data.name)
            .catch(() => null);
        });
        const authorNames = await Promise.all(authorFetches);
        // filter nulls
        for (const n of authorNames) if (n) authors.push(n);
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
    } else if (id.startsWith("books/") || id.startsWith("OL")) {
      // try books (editions) endpoint
      url = `https://openlibrary.org/${id}.json`;
      const r = await axios.get(url);
      const data = r.data;

      const title = data.title || data.full_title || null;
      const authors =
        (data.authors || [])
          .map((a) => (a.name ? a.name : a.author?.key || null))
          .filter(Boolean) || [];

      let cover = null;
      if (data.covers && data.covers.length)
        cover = `https://covers.openlibrary.org/b/id/${data.covers[0]}-L.jpg`;

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
    } else {
      return null;
    }
  } catch (err) {
    // don't throw — caller will handle null
    return null;
  }
}

/**
 * Helper: find a Book by externalId in DB or create it using payload
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

/* ---------- GET /api/books/:externalId ---------- */
/**
 * Returns a Book from DB. If not present, tries to fetch from OpenLibrary and store it.
 * Accepts param externalId in forms:
 *  - /works/OL82563W
 *  - OL82563W
 *  - /books/OL123M
 */
export async function getBook(req, res, next) {
  try {
    const rawId = req.params.externalId;
    if (!rawId)
      return res.status(400).json({ message: "externalId required in path" });

    const normalized = normalizeExternalId(rawId);

    // try DB first
    let book = await Book.findOne({ externalId: normalized });
    if (book) {
      return res.json({ book });
    }

    // try fetching from OpenLibrary
    const fetched = await fetchFromOpenLibrary(normalized);
    if (!fetched) {
      return res.status(404).json({ message: "Book not found" });
    }

    // save and return
    book = await findOrCreateBook(fetched);
    return res.status(201).json({ book, fetched: true });
  } catch (err) {
    next(err);
  }
}

/* ---------- GET /api/books ---------- */
/**
 * List recent books stored in DB
 * Query params: page (default 1), limit (default 20)
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
