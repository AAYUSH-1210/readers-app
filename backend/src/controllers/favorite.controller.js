// backend/src/controllers/favorite.controller.js
import Favorite from "../models/Favorite.js";
import Book from "../models/Book.js";

/* normalize externalId */
function normalizeExternalId(externalId) {
  if (!externalId) return null;
  externalId = String(externalId).trim();
  if (externalId.startsWith("/")) return externalId;
  if (/^OL.*W$/.test(externalId)) return `/works/${externalId}`;
  if (/^OL.*M$/.test(externalId)) return `/books/${externalId}`;
  if (externalId.startsWith("works/") || externalId.startsWith("books/"))
    return `/${externalId}`;
  return externalId;
}

/* create minimal Book if missing */
async function findOrCreateBook({
  externalId,
  title,
  authors = [],
  cover = null,
  source = "openlibrary",
  raw = {},
}) {
  const normalized = normalizeExternalId(externalId);
  if (!normalized) throw new Error("externalId required");
  let book = await Book.findOne({ externalId: normalized });
  if (!book) {
    book = await Book.create({
      externalId: normalized,
      title: title || "Untitled",
      authors,
      cover,
      source,
      raw,
    });
  }
  return book;
}

/* POST /api/favorites/add */
export async function addFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId, title, authors, cover, note } = req.body;
    if (!externalId)
      return res.status(400).json({ message: "externalId required" });

    const book = await findOrCreateBook({ externalId, title, authors, cover });

    // check existing
    const existing = await Favorite.findOne({ user: userId, book: book._id });
    if (existing) return res.status(200).json({ favorite: existing });

    const fav = await Favorite.create({
      user: userId,
      book: book._id,
      externalId: book.externalId,
      note: note || "",
    });

    await fav.populate("book");
    res.status(201).json({ favorite: fav });
  } catch (err) {
    // handle duplicate key race
    if (err && err.code === 11000) {
      const existing = await Favorite.findOne({
        user: req.user.id,
        externalId: normalizeExternalId(req.body.externalId),
      }).populate("book");
      return res.status(200).json({ favorite: existing });
    }
    next(err);
  }
}

/* GET /api/favorites/list */
export async function listFavorites(req, res, next) {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Favorite.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("book"),
      Favorite.countDocuments({ user: userId }),
    ]);

    res.json({ favorites: items, total, page, limit });
  } catch (err) {
    next(err);
  }
}

/* DELETE /api/favorites/:id */
export async function removeFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const fav = await Favorite.findOne({ _id: id, user: userId });
    if (!fav) return res.status(404).json({ message: "Favorite not found" });

    await Favorite.findByIdAndDelete(id);
    res.json({ message: "removed" });
  } catch (err) {
    next(err);
  }
}

/* GET /api/favorites/check?externalId=... */
export async function checkFavorite(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId } = req.query;
    if (!externalId)
      return res.status(400).json({ message: "externalId required" });

    const normalized = normalizeExternalId(externalId);
    const book = await Book.findOne({ externalId: normalized });
    if (!book) return res.json({ inFavorites: false });

    const fav = await Favorite.findOne({
      user: userId,
      book: book._id,
    }).populate("book");
    return res.json({ inFavorites: Boolean(fav), favorite: fav });
  } catch (err) {
    next(err);
  }
}
