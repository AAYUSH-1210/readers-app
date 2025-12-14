// backend/src/controllers/search.controller.js
import axios from "axios";
import User from "../models/User.js";
import Book from "../models/Book.js";

export async function searchBooks(req, res, next) {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ message: "q query param required" });

    const page = parseInt(req.query.page || "1", 10);
    const limit = 20;
    const skip = (page - 1) * limit;

    const regex = new RegExp(q, "i");

    // 1️⃣ Search local DB first
    const localBooks = await Book.find({
      $or: [{ title: regex }, { authors: regex }],
    })
      .select("externalId title authors cover source")
      .skip(skip)
      .limit(limit)
      .lean();

    let results = localBooks.map((b) => ({
      externalId: b.externalId,
      title: b.title,
      authors: b.authors,
      cover: b.cover,
      source: "local",
    }));

    // 2️⃣ Fallback to OpenLibrary if needed
    if (results.length < limit) {
      const offset = (page - 1) * limit;
      const r = await axios.get("https://openlibrary.org/search.json", {
        params: { q, limit, offset },
      });

      const docs = r.data?.docs || [];
      const existing = new Set(results.map((r) => r.externalId));

      for (const d of docs) {
        if (results.length >= limit) break;
        if (existing.has(d.key)) continue;

        results.push({
          externalId: d.key,
          title: d.title,
          authors: d.author_name || [],
          year: d.first_publish_year,
          cover: d.cover_i
            ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
            : null,
          source: "openlibrary",
        });
      }
    }

    res.json({ docs: results });
  } catch (err) {
    next(err);
  }
}

/* ============================
   Search Users (public)
   ============================ */
export async function searchUsers(req, res, next) {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ message: "q query param required" });

    const regex = new RegExp(q, "i");

    const users = await User.find({
      $or: [{ username: regex }, { name: regex }],
    })
      .select("username name avatarUrl")
      .limit(20)
      .lean();

    res.json({ users });
  } catch (err) {
    next(err);
  }
}
