// backend/src/controllers/search.controller.js
import axios from "axios";

export async function searchBooks(req, res, next) {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ message: "q query param required" });

    const page = parseInt(req.query.page || "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    const url = `https://openlibrary.org/search.json`;
    const r = await axios.get(url, { params: { q, limit, offset } });

    const docs = (r.data && r.data.docs) || [];
    const results = docs.map((d) => {
      const cover = d.cover_i
        ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
        : null;
      const externalId = d.key; // e.g. "/works/OL12345W"
      return {
        externalId,
        title: d.title,
        authors: d.author_name || [],
        year: d.first_publish_year,
        cover,
        source: "openlibrary",
      };
    });

    return res.json({ docs: results, numFound: r.data.numFound });
  } catch (err) {
    next(err);
  }
}
