// backend/src/controllers/import.controller.js
//
// Data Import Controller
//
// Responsibilities:
// - Restore user-owned data from an export payload
// - Support data portability and migrations
// - Ensure imported data is safely re-owned by the authenticated user
//
// Imported entities:
// - Shelves
// - Shelf items
// - Reading entries
// - Notes
// - Reviews
//
// Design notes:
// - Import is ID-agnostic (Mongo _id values are NOT trusted)
// - Existing user data is NOT deleted or overwritten
// - Duplicate-safe: checks are performed before inserts
// - Assumes payload was generated via export.controller.js
//
// Security:
// - All imported documents are forcibly bound to req.user.id
// - Cross-user data injection is prevented

import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";
import Note from "../models/Note.js";
import Review from "../models/Review.js";

/* ======================================================
   POST /api/import
====================================================== */
/**
 * Import previously exported user data.
 *
 * Expected payload shape:
 * {
 *   meta: { version, exportedAt, userId },
 *   data: {
 *     reading: [],
 *     shelves: [],
 *     shelfItems: [],
 *     notes: [],
 *     reviews: []
 *   }
 * }
 *
 * Behavior:
 * - Existing data is preserved
 * - Only missing records are inserted
 * - Shelf names are used as stable identifiers
 */
export async function importAll(req, res, next) {
  try {
    const userId = req.user.id;
    const payload = req.body;

    if (!payload?.data || typeof payload.data !== "object") {
      return res.status(400).json({ message: "Invalid import payload" });
    }

    const {
      reading = [],
      shelves = [],
      shelfItems = [],
      notes = [],
      reviews = [],
    } = payload.data;

    /* ======================================================
       Shelves
       - Recreated by name (unique per user)
    ====================================================== */
    const shelfMap = new Map(); // shelfName -> shelfId

    for (const s of shelves) {
      if (!s?.name) continue;

      let existing = await Shelf.findOne({
        user: userId,
        name: s.name,
      });

      if (!existing) {
        existing = await Shelf.create({
          name: s.name,
          description: s.description || "",
          user: userId,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        });
      }

      shelfMap.set(s.name, existing._id);
    }

    /* ======================================================
       Shelf Items
       - Bound via shelf name → shelfId mapping
       - Skips orphan or invalid entries
    ====================================================== */
    for (const si of shelfItems) {
      const shelfName = si.shelf?.name;
      const shelfId = shelfMap.get(shelfName);
      if (!shelfId || !si.book) continue;

      const exists = await ShelfItem.findOne({
        shelf: shelfId,
        book: si.book,
      });

      if (!exists) {
        await ShelfItem.create({
          shelf: shelfId,
          book: si.book,
          note: si.note || "",
          externalId: si.externalId,
          createdAt: si.createdAt,
        });
      }
    }

    /* ======================================================
       Reading Entries
       - One entry per user + book
    ====================================================== */
    for (const r of reading) {
      if (!r?.book) continue;

      const exists = await Reading.findOne({
        user: userId,
        book: r.book,
      });

      if (!exists) {
        await Reading.create({
          user: userId,
          book: r.book,
          externalId: r.externalId,
          status: r.status,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      }
    }

    /* ======================================================
       Notes
       - Deduped by user + book + content
    ====================================================== */
    for (const n of notes) {
      if (!n?.book || !n?.content) continue;

      const exists = await Note.findOne({
        user: userId,
        book: n.book,
        content: n.content,
      });

      if (!exists) {
        await Note.create({
          user: userId,
          book: n.book,
          externalId: n.externalId,
          title: n.title,
          content: n.content,
          highlight: n.highlight,
          pageNumber: n.pageNumber,
          createdAt: n.createdAt,
        });
      }
    }

    /* ======================================================
       Reviews
       - One review per user + book
    ====================================================== */
    for (const r of reviews) {
      if (!r?.book) continue;

      const exists = await Review.findOne({
        user: userId,
        book: r.book,
      });

      if (!exists) {
        await Review.create({
          user: userId,
          book: r.book,
          externalId: r.externalId,
          rating: r.rating,
          text: r.text,
          createdAt: r.createdAt,
        });
      }
    }

    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
