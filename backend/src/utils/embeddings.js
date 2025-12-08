// backend/src/utils/embeddings.js
import natural from "natural";
import Book from "../models/Book.js";
import OpenAI from "openai";

const OPENAI_KEY = process.env.OPENAI_API_KEY || null;
const openaiClient = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

/* ------------------------------------------
   Build text content for ML embedding
------------------------------------------- */
export function bookToText(book) {
  const parts = [];
  if (book.title) parts.push(book.title);
  if (book.authors?.length) parts.push(book.authors.join(", "));
  if (book.description) parts.push(String(book.description));

  const subjects =
    (book.raw && (book.raw.subjects || book.raw.openlibrary?.subjects)) || [];
  if (subjects.length) parts.push(subjects.slice(0, 10).join(", "));

  return parts.join("\n");
}

/* ------------------------------------------
   Try OpenAI embedding (returns null if failed)
------------------------------------------- */
async function tryOpenAIEmbedding(text) {
  if (!openaiClient) return null;

  try {
    const resp = await openaiClient.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return {
      embedding: resp.data[0].embedding,
      model: "openai:text-embedding-3-small",
    };
  } catch (err) {
    console.warn(
      "OpenAI FAILED → using fallback",
      err.response?.data || err.message
    );
    return null;
  }
}

/* ------------------------------------------
   TF–IDF Corpus embedding (fallback)
------------------------------------------- */
const TOP_N = 256;

export async function computeCorpusTfIdfEmbeddings({ topN = TOP_N } = {}) {
  const books = await Book.find().lean();
  if (!books.length) return { results: [] };

  const tfidf = new natural.TfIdf();
  const idMap = [];

  // Add all books to corpus
  books.forEach((b) => {
    tfidf.addDocument(bookToText(b));
    idMap.push(String(b._id));
  });

  // Build vocabulary by global importance
  const termTotals = {};
  for (let i = 0; i < books.length; i++) {
    const terms = tfidf.listTerms(i);
    for (const t of terms) {
      termTotals[t.term] = (termTotals[t.term] || 0) + t.tfidf;
    }
  }

  const vocab = Object.entries(termTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term]) => term);

  const results = [];

  // Create each book vector
  for (let i = 0; i < books.length; i++) {
    const vec = vocab.map((term) => tfidf.tfidf(term, i) || 0);

    // Normalize L2
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    const embedding = vec.map((v) => v / norm);

    results.push({
      _id: idMap[i],
      embedding,
    });
  }

  return { results, vocabSize: vocab.length };
}

/* ------------------------------------------
   Save embeddings (OpenAI → fallback)
------------------------------------------- */
export async function computeAndSaveBestEmbedding(bookDoc) {
  const text = bookToText(bookDoc);

  // 1) Try OpenAI first
  let result = await tryOpenAIEmbedding(text);

  if (!result) {
    // 2) Use TF-IDF fallback (single-document quick embedding)
    // NOTE: Better quality comes from corpus TF-IDF below
    const tfidf = new natural.TfIdf();
    tfidf.addDocument(text);

    const terms = tfidf.listTerms(0).slice(0, TOP_N); // top terms
    const vec = terms.map((t) => t.tfidf || 0);
    while (vec.length < TOP_N) vec.push(0);

    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;

    result = {
      embedding: vec.map((v) => v / norm),
      model: "tfidf-single",
    };
  }

  // Save embedding to DB
  bookDoc.embedding = result.embedding;
  bookDoc.embeddingModel = result.model;
  await bookDoc.save();

  return bookDoc;
}

/* ------------------------------------------
   Compute TF-IDF corpus embeddings (best fallback)
------------------------------------------- */
export async function saveCorpusEmbeddingsToDB() {
  const { results } = await computeCorpusTfIdfEmbeddings();

  for (const item of results) {
    await Book.findByIdAndUpdate(item._id, {
      embedding: item.embedding,
      embeddingModel: "tfidf-corpus",
    });
  }

  return results.length;
}

/* ------------------------------------------
   Cosine similarity + Top-K search
------------------------------------------- */
export function cosineSimilarity(a = [], b = []) {
  let dot = 0,
    na = 0,
    nb = 0;

  for (let i = 0; i < a.length; i++) {
    dot += (a[i] || 0) * (b[i] || 0);
    na += (a[i] || 0) ** 2;
    nb += (b[i] || 0) ** 2;
  }

  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function findSimilarByEmbedding(seed, { limit = 10 } = {}) {
  const candidates = await Book.find({
    embedding: { $exists: true, $ne: null },
  }).select("title authors cover embedding externalId description");

  const scored = candidates.map((c) => ({
    book: c,
    score: cosineSimilarity(seed, c.embedding || []),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
