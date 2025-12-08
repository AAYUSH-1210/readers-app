import mongoose from "mongoose";
import Reading from "../models/Reading.js";
import Review from "../models/Review.js";
import Book from "../models/Book.js";
import Follow from "../models/Follow.js";
import { getEmbeddingForText, normalizeVector as normalizeFromEmbeddings } from "./embeddings.js";

/* Minimal robust computeUserTasteVector:
   - uses Reading + Review signals
   - returns normalized dense vector or null
*/
function normalizeVectorSimple(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + (x || 0) ** 2, 0));
  if (norm === 0) return v;
  return v.map(x => (x || 0) / norm);
}

export async function computeUserTasteVector(userId) {
  if (!userId) return null;

  const reads = await Reading.find({ user: userId }).populate("book").lean().limit(50);
  const reviews = await Review.find({ user: userId }).populate("book").lean().limit(50);

  const candidates = [];
  for (const r of reads) if (r.book) candidates.push(r.book);
  for (const r of reviews) if (r.book) candidates.push(r.book);
  if (candidates.length === 0) return null;

  const vectors = [];
  for (const b of candidates) {
    if (Array.isArray(b.embedding) && b.embedding.length) {
      vectors.push(b.embedding);
      continue;
    }
    const text = `${b.title || ""} ${b.subtitle || ""} ${b.description || ""}`.slice(0, 2000);
    try {
      const emb = await getEmbeddingForText(text);
      if (emb) vectors.push(emb);
    } catch (e) {
      // ignore single embedding failures in test/minimal mode
    }
  }

  if (vectors.length === 0) return null;

  const dim = vectors[0].length;
  const agg = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) agg[i] += v[i] || 0;
  for (let i = 0; i < dim; i++) agg[i] /= vectors.length;

  try { if (typeof normalizeFromEmbeddings === "function") return normalizeFromEmbeddings(agg); } catch {}
  return normalizeVectorSimple(agg);
}

export default computeUserTasteVector;