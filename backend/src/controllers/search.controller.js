// backend/src/controllers/search.controller.js
//
// Search controller
//
// Responsibilities:
// - Search books (local DB + OpenLibrary fallback)
// - Search public users
// - Deduplicate results safely
// - Provide stable pagination

import axios from "axios";
import User from "../models/User.js";
import Book from "../models/Book.js";

/* ======================================================
   Helpers
====================================================== */

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeExternalId(externalId) {
  if (!externalId) return null;
  if (externalId.startsWith("/")) return externalId;
  if (/^OL.*W$/.test(externalId)) return `/works/${externalId}`;
  if (/^OL.*M$/.test(externalId)) return `/books/${externalId}`;
  return externalId;
}

/* ======================================================
   GET /api/search/books?q=&page=&limit=
====================================================== */
export async function searchBooks(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ message: "q query param required" });
    }

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const safeRegex = new RegExp(escapeRegex(q), "i");

    /* ---------- 1️⃣ Local DB search ---------- */
    const localBooks = await Book.find({
      $or: [{ title: safeRegex }, { authors: safeRegex }],
    })
      .select("externalId title authors cover source")
      .skip(skip)
      .limit(limit)
      .lean();

    const results = [];
    const seen = new Set();

    for (const b of localBooks) {
      const id = normalizeExternalId(b.externalId);
      if (seen.has(id)) continue;
      seen.add(id);

      results.push({
        externalId: id,
        title: b.title,
        authors: b.authors || [],
        cover: b.cover || null,
        source: "local",
      });
    }

    /* ---------- 2️⃣ OpenLibrary fallback ---------- */
    if (results.length < limit) {
      const offset = (page - 1) * limit;

      const r = await axios.get("https://openlibrary.org/search.json", {
        params: { q, limit, offset },
        timeout: 8000,
      });

      const docs = r.data?.docs || [];

      for (const d of docs) {
        if (results.length >= limit) break;

        const id = normalizeExternalId(d.key);
        if (!id || seen.has(id)) continue;

        seen.add(id);

        results.push({
          externalId: id,
          title: d.title || "Untitled",
          authors: d.author_name || [],
          year: d.first_publish_year || null,
          cover: d.cover_i
            ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
            : null,
          source: "openlibrary",
        });
      }
    }

    res.json({
      page,
      limit,
      count: results.length,
      items: results,
    });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   GET /api/search/users?q=
====================================================== */
export async function searchUsers(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.status(400).json({ message: "q query param required" });
    }

    const safeRegex = new RegExp(escapeRegex(q), "i");

    const users = await User.find({
      $or: [{ username: safeRegex }, { name: safeRegex }],
    })
      .select("username name avatarUrl")
      .limit(20)
      .lean();

    res.json({ users });
  } catch (err) {
    next(err);
  }
}
