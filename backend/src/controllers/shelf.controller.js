// backend/src/controllers/shelf.controller.js
//
// Shelf controller.
//
// Responsibilities:
// - CRUD shelves (user-owned)
// - Manage shelf items (books)
// - Lazy-create books via externalId normalization
//
// Notes:
// - Shelf names are unique per user
// - Shelf items are unique per shelf+book
// - All operations enforce ownership

import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";
import Book from "../models/Book.js";

/* ======================================================
   Helpers
====================================================== */

/**
 * Normalize OpenLibrary externalId formats.
 */
function normalizeExternalId(externalId) {
  if (!externalId) return null;
  externalId = externalId.trim();

  if (externalId.startsWith("/")) return externalId;
  if (/^OL.*W$/.test(externalId)) return `/works/${externalId}`;
  if (/^OL.*M$/.test(externalId)) return `/books/${externalId}`;
  if (externalId.startsWith("works/") || externalId.startsWith("books/")) {
    return `/${externalId}`;
  }
  return externalId;
}

/**
 * Ensure Book exists or create a minimal one.
 */
async function findOrCreateBook({ externalId, title, authors = [], cover }) {
  const normalized = normalizeExternalId(externalId);
  if (!normalized) {
    throw new Error("Invalid externalId");
  }

  let book = await Book.findOne({ externalId: normalized });
  if (!book) {
    book = await Book.create({
      externalId: normalized,
      title: title || "",
      authors,
      cover: cover || null,
      source: "openlibrary",
    });
  }

  return book;
}

/* ======================================================
   SHELF CRUD
====================================================== */

/* POST /api/shelves/create */
export async function createShelf(req, res, next) {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Shelf name is required" });
    }

    const shelf = await Shelf.create({
      user: userId,
      name: name.trim(),
      description: description || "",
    });

    res.status(201).json({ shelf });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "Shelf name already exists for this user" });
    }
    next(err);
  }
}

/* GET /api/shelves/my */
export async function listMyShelves(req, res, next) {
  try {
    const userId = req.user.id;
    const shelves = await Shelf.find({ user: userId }).sort({
      createdAt: -1,
    });
    res.json({ shelves });
  } catch (err) {
    next(err);
  }
}

/* GET /api/shelves/:shelfId */
export async function getShelf(req, res, next) {
  try {
    const shelf = await Shelf.findById(req.params.shelfId);
    if (!shelf) return res.status(404).json({ message: "Shelf not found" });

    if (String(shelf.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    res.json({ shelf });
  } catch (err) {
    next(err);
  }
}

/* PATCH /api/shelves/:shelfId */
export async function updateShelf(req, res, next) {
  try {
    const shelf = await Shelf.findById(req.params.shelfId);
    if (!shelf) return res.status(404).json({ message: "Shelf not found" });

    if (String(shelf.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { name, description } = req.body;

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ message: "Shelf name cannot be empty" });
      }
      shelf.name = name.trim();
    }

    if (description !== undefined) shelf.description = description;

    await shelf.save();
    res.json({ shelf });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Shelf name already exists" });
    }
    next(err);
  }
}

/* DELETE /api/shelves/:shelfId */
export async function deleteShelf(req, res, next) {
  try {
    const shelf = await Shelf.findById(req.params.shelfId);
    if (!shelf) return res.status(404).json({ message: "Shelf not found" });

    if (String(shelf.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await ShelfItem.deleteMany({ shelf: shelf._id });
    await Shelf.findByIdAndDelete(shelf._id);

    res.json({ message: "Shelf deleted" });
  } catch (err) {
    next(err);
  }
}

/* ======================================================
   SHELF ITEMS
====================================================== */

/* POST /api/shelves/:shelfId/add */
export async function addBookToShelf(req, res, next) {
  try {
    const shelf = await Shelf.findById(req.params.shelfId);
    if (!shelf) return res.status(404).json({ message: "Shelf not found" });

    if (String(shelf.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { externalId, title, authors, cover, note } = req.body;
    const book = await findOrCreateBook({ externalId, title, authors, cover });

    const existing = await ShelfItem.findOne({
      shelf: shelf._id,
      book: book._id,
    });

    if (existing) {
      return res.status(200).json({ item: existing });
    }

    const item = await ShelfItem.create({
      shelf: shelf._id,
      book: book._id,
      externalId: book.externalId,
      note: note || "",
    });

    await item.populate("book");
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

/* GET /api/shelves/:shelfId/items */
export async function listShelfItems(req, res, next) {
  try {
    const shelf = await Shelf.findById(req.params.shelfId);
    if (!shelf) return res.status(404).json({ message: "Shelf not found" });

    if (String(shelf.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const items = await ShelfItem.find({ shelf: shelf._id })
      .populate("book")
      .sort({ createdAt: -1 });

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/* DELETE /api/shelves/item/:itemId */
export async function removeBookFromShelf(req, res, next) {
  try {
    const item = await ShelfItem.findById(req.params.itemId).populate("shelf");
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (String(item.shelf.user) !== String(req.user.id)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    await ShelfItem.findByIdAndDelete(item._id);
    res.json({ message: "removed" });
  } catch (err) {
    next(err);
  }
}
