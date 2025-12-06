// src/pages/SearchBooksPage.jsx
import React, { useEffect, useState } from "react";
import api from "../services/api";
import BookCard from "../components/BookCard";

export default function SearchBooksPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [readingMap, setReadingMap] = useState({}); // externalId -> readingEntry or true
  const [searching, setSearching] = useState(false);

  // load user's reading list once (on mount) to mark items
  useEffect(() => {
    let mounted = true;
    async function loadReading() {
      try {
        const res = await api.get("/reading/list");
        if (!mounted) return;
        const map = {};
        (res.data.list || []).forEach((item) => {
          if (item.book && item.book.externalId) {
            map[item.book.externalId] = item; // store reading entry (so we have id)
          }
        });
        setReadingMap(map);
      } catch (err) {
        // silent: user may be unauthenticated; it's okay
        console.error("Failed to load reading list", err);
      }
    }
    loadReading();
    return () => {
      mounted = false;
    };
  }, []);

  async function doSearch(e) {
    e?.preventDefault();
    if (!q) return;
    setLoading(true);
    setSearching(true);
    try {
      const res = await api.get("/search", { params: { q } });
      setResults(res.data.docs || []);
    } catch (err) {
      console.error(err);
      alert("Search failed");
    } finally {
      setLoading(false);
    }
  }

  // add book — update readingMap optimistically using server response
  async function addToReading(book) {
    try {
      // disable during request by temporarily setting map to true
      setReadingMap((prev) => ({ ...prev, [book.externalId]: true }));
      const payload = {
        externalId: book.externalId,
        title: book.title,
        authors: book.authors,
        cover: book.cover,
        source: book.source,
      };
      const res = await api.post("/reading/add", payload);
      // server returns reading entry with populated book
      const reading = res.data.reading;
      if (reading && reading.book && reading.book.externalId) {
        setReadingMap((prev) => ({
          ...prev,
          [reading.book.externalId]: reading,
        }));
      } else {
        // if server didn't return populated book, keep a truthy flag
        setReadingMap((prev) => ({ ...prev, [book.externalId]: true }));
      }
      // nice UX: ephemeral toast (implement showToast in your app)
      if (typeof window.showToast === "function")
        window.showToast("Added to reading list");
      else alert("Added to reading list");
    } catch (err) {
      console.error(err);
      setReadingMap((prev) => {
        const p = { ...prev };
        delete p[book.externalId];
        return p;
      });
      alert("Failed to add to reading list");
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Search books</h2>
      <form onSubmit={doSearch} style={{ marginBottom: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title, author, ISBN..."
        />
        <button type="submit" disabled={loading}>
          Search
        </button>
      </form>

      {loading && <div>Loading…</div>}
      {!loading && searching && results.length === 0 && <div>No results</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {results.map((r) => (
          <BookCard
            key={r.externalId}
            book={r}
            inList={Boolean(readingMap[r.externalId])}
            onAdd={addToReading}
          />
        ))}
      </div>
    </div>
  );
}
