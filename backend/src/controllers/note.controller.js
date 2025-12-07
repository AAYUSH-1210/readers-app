// backend/src/controllers/note.controller.js
import Note from "../models/Note.js";
import Book from "../models/Book.js";

/* Normalize externalId */
function normalizeExternalId(externalId) {
  if (!externalId) return null;
  externalId = externalId.trim();

  if (externalId.startsWith("/")) return externalId;
  if (/^OL.*W$/.test(externalId)) return `/works/${externalId}`;
  if (/^OL.*M$/.test(externalId)) return `/books/${externalId}`;

  if (externalId.startsWith("works/") || externalId.startsWith("books/"))
    return `/${externalId}`;

  return externalId;
}

/* Ensure Book exists */
async function findOrCreateBook({
  externalId,
  title,
  authors = [],
  cover = null,
}) {
  const normalized = normalizeExternalId(externalId);

  let book = await Book.findOne({ externalId: normalized });
  if (!book) {
    book = await Book.create({
      externalId: normalized,
      title: title || "",
      authors,
      cover,
      source: "openlibrary",
    });
  }

  return book;
}

/* ============================= ADD NOTE ============================= */

export async function addNote(req, res, next) {
  try {
    const userId = req.user.id;
    const {
      externalId,
      title,
      content,
      highlight,
      pageNumber,
      authors,
      cover,
    } = req.body;

    if (!externalId || !content)
      return res
        .status(400)
        .json({ message: "externalId and content are required" });

    const book = await findOrCreateBook({ externalId, title, authors, cover });

    const note = await Note.create({
      user: userId,
      book: book._id,
      externalId: book.externalId,
      title: title || "",
      content,
      highlight: highlight || "",
      pageNumber: pageNumber ?? null,
    });

    await note.populate("book");

    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
}

/* ============================= GET NOTES FOR BOOK ============================= */

export async function getNotesForBook(req, res, next) {
  try {
    const userId = req.user.id;
    const rawId = req.params.externalId;

    if (!rawId) return res.status(400).json({ message: "externalId required" });

    const normalized = normalizeExternalId(rawId);
    const book = await Book.findOne({ externalId: normalized });

    if (!book) return res.json({ notes: [] });

    const notes = await Note.find({ user: userId, book: book._id })
      .sort({ createdAt: -1 })
      .populate("book");

    res.json({ notes });
  } catch (err) {
    next(err);
  }
}

/* ============================= GET NOTES FOR USER ============================= */

export async function getNotesForUser(req, res, next) {
  try {
    const userId = req.user.id;

    const notes = await Note.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate("book");

    res.json({ notes });
  } catch (err) {
    next(err);
  }
}

/* ============================= UPDATE NOTE ============================= */

export async function updateNote(req, res, next) {
  try {
    const userId = req.user.id;
    const noteId = req.params.noteId;
    const { title, content, highlight, pageNumber } = req.body;

    const note = await Note.findById(noteId);
    if (!note) return res.status(404).json({ message: "Note not found" });

    if (String(note.user) !== String(userId))
      return res.status(403).json({ message: "Not allowed" });

    if (title !== undefined) note.title = title;
    if (content !== undefined) note.content = content;
    if (highlight !== undefined) note.highlight = highlight;
    if (pageNumber !== undefined) note.pageNumber = pageNumber;

    await note.save();
    await note.populate("book");

    res.json({ note });
  } catch (err) {
    next(err);
  }
}

/* ============================= DELETE NOTE ============================= */

export async function deleteNote(req, res, next) {
  try {
    const userId = req.user.id;
    const noteId = req.params.noteId;

    const note = await Note.findById(noteId);
    if (!note) return res.status(404).json({ message: "Note not found" });

    if (String(note.user) !== String(userId))
      return res.status(403).json({ message: "Not allowed" });

    await Note.findByIdAndDelete(noteId);

    res.json({ message: "deleted" });
  } catch (err) {
    next(err);
  }
}
