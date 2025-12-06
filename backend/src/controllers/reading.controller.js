// backend/src/controllers/reading.controller.js
import Book from "../models/Book.js";
import Reading from "../models/Reading.js";

/* ---------- helper ---------- */
async function findOrCreateBook(payload) {
  const { externalId, title, authors, cover, source, raw } = payload;
  let book = await Book.findOne({ externalId });
  if (!book) {
    book = await Book.create({
      externalId,
      title,
      authors,
      cover,
      source,
      raw,
    });
  }
  return book;
}

/* ---------- add to reading list ---------- */
export async function addToReading(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId, title, authors, cover, source } = req.body;
    if (!externalId || !title)
      return res.status(400).json({ message: "externalId and title required" });

    const book = await findOrCreateBook({
      externalId,
      title,
      authors,
      cover,
      source,
      raw: req.body.raw || {},
    });

    // prevent duplicates
    const existing = await Reading.findOne({ user: userId, book: book._id });
    if (existing) return res.status(200).json({ reading: existing });

    const reading = await Reading.create({
      user: userId,
      book: book._id,
      status: "to-read",
      progress: 0,
    });
    await reading.populate("book");
    res.status(201).json({ reading });
  } catch (err) {
    next(err);
  }
}

/* ---------- get reading list ---------- */
export async function getReadingList(req, res, next) {
  try {
    const userId = req.user.id;
    const list = await Reading.find({ user: userId })
      .populate("book")
      .sort({ updatedAt: -1 });
    res.json({ list });
  } catch (err) {
    next(err);
  }
}

/* ---------- update reading entry ---------- */
export async function updateReading(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { progress, status, notes } = req.body;

    const reading = await Reading.findOne({ _id: id, user: userId });
    if (!reading) return res.status(404).json({ message: "Not found" });

    if (progress !== undefined) {
      reading.progress = Math.max(0, Math.min(100, progress));
    }
    if (status) reading.status = status;
    if (notes !== undefined) reading.notes = notes;
    if (reading.progress === 100 || status === "finished") {
      reading.status = "finished";
      reading.finishedAt = reading.finishedAt || new Date();
    }
    await reading.save();
    await reading.populate("book");
    res.json({ reading });
  } catch (err) {
    next(err);
  }
}

/* ---------- remove reading entry ---------- */
export async function removeReading(req, res, next) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const reading = await Reading.findOneAndDelete({ _id: id, user: userId });
    if (!reading) return res.status(404).json({ message: "Not found" });
    res.json({ message: "removed" });
  } catch (err) {
    next(err);
  }
}

/* ---------- check if book (externalId) exists in user's list ---------- */
export async function checkBookInList(req, res, next) {
  try {
    const userId = req.user.id;
    const { externalId } = req.query;
    if (!externalId)
      return res.status(400).json({ message: "externalId required" });

    const book = await Book.findOne({ externalId });
    if (!book) return res.json({ inList: false });

    const reading = await Reading.findOne({ user: userId, book: book._id });
    return res.json({ inList: Boolean(reading), reading });
  } catch (err) {
    next(err);
  }
}
