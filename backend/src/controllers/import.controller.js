import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";
import Note from "../models/Note.js";
import Review from "../models/Review.js";
import mongoose from "mongoose";

export async function importAll(req, res, next) {
  try {
    const userId = req.user.id;
    const payload = req.body;

    if (!payload?.data) {
      return res.status(400).json({ message: "Invalid import payload" });
    }

    const {
      reading = [],
      shelves = [],
      shelfItems = [],
      notes = [],
      reviews = [],
    } = payload.data;

    /* ---------- Shelves ---------- */
    const shelfMap = new Map();

    for (const s of shelves) {
      let existing = await Shelf.findOne({
        user: userId,
        name: s.name,
      });

      if (!existing) {
        existing = await Shelf.create({
          ...s,
          user: userId,
        });
      }
      shelfMap.set(s.name, existing._id);
    }

    /* ---------- Shelf Items ---------- */
    for (const si of shelfItems) {
      const shelfId = shelfMap.get(si.shelf?.name);
      if (!shelfId || !si.book) continue;

      const exists = await ShelfItem.findOne({
        shelf: shelfId,
        book: si.book,
      });

      if (!exists) {
        await ShelfItem.create({
          shelf: shelfId,
          book: si.book,
          createdAt: si.createdAt,
        });
      }
    }

    /* ---------- Reading ---------- */
    for (const r of reading) {
      const exists = await Reading.findOne({
        user: userId,
        book: r.book,
      });

      if (!exists) {
        await Reading.create({
          ...r,
          user: userId,
        });
      }
    }

    /* ---------- Notes ---------- */
    for (const n of notes) {
      const exists = await Note.findOne({
        user: userId,
        book: n.book,
        text: n.text,
      });

      if (!exists) {
        await Note.create({
          ...n,
          user: userId,
        });
      }
    }

    /* ---------- Reviews ---------- */
    for (const r of reviews) {
      const exists = await Review.findOne({
        user: userId,
        book: r.book,
      });

      if (!exists) {
        await Review.create({
          ...r,
          user: userId,
        });
      }
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
