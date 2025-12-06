// src/components/BookCard.jsx
import React from "react";

export default function BookCard({ book, inList = false, onAdd, onView }) {
  return (
    <div
      className="book-card"
      style={{
        display: "flex",
        gap: 12,
        padding: 12,
        background: "#111",
        borderRadius: 8,
      }}
    >
      <img
        src={book.cover || "/placeholder.png"}
        alt={book.title}
        style={{ width: 90, height: 130, objectFit: "cover", borderRadius: 6 }}
      />
      <div style={{ flex: 1 }}>
        <h3 style={{ margin: 0 }}>{book.title}</h3>
        <p style={{ margin: "6px 0", color: "#aaa" }}>
          {(book.authors || []).join(", ")}
        </p>
        <p style={{ margin: "6px 0", color: "#888", fontSize: 13 }}>
          {book.year ? `First published ${book.year}` : ""}
        </p>
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => onAdd && onAdd(book)}
            disabled={inList}
            style={{ marginRight: 8, opacity: inList ? 0.6 : 1 }}
          >
            {inList ? "In list" : "Add to reading"}
          </button>

          <button onClick={() => onView && onView(book)}>View</button>
        </div>
      </div>
    </div>
  );
}
