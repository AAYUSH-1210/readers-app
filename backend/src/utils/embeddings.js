/* backend/src/utils/embeddings.js
   Minimal safe embeddings helper for tests and local development.
   Exports: getEmbeddingForText, normalizeVector, findSimilarByEmbedding, cosineSimilarity
*/

import Book from "../models/Book.js";

/* normalize vector */
export function normalizeVector(v) {
  if (!Array.isArray(v) || v.length === 0) return v;
  const norm = Math.sqrt(v.reduce((s, x) => s + (x || 0) ** 2, 0));
  if (norm === 0) return v;
  return v.map(x => (x || 0) / norm);
}

/* cosine similarity */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += (a[i] || 0) * (b[i] || 0);
    na += (a[i] || 0) ** 2;
    nb += (b[i] || 0) ** 2;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

/* deterministic fallback embedding */
function fallbackEmbeddingFromText(text = "") {
  const L = 64;
  const v = new Array(L).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const idx = i % L;
    v[idx] += (code % 13) + (code % 7);
  }
  for (let i = 0; i < L; i++) v[i] = v[i] / 100.0;
  return normalizeVector(v);
}

/* dynamic OpenAI client loader (safe if OPENAI_API_KEY absent) */
let _openaiClient = null;
async function getOpenAIClient() {
  if (_openaiClient) return _openaiClient;
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const mod = await import("openai");
    const OpenAI = mod?.OpenAI ?? mod?.default ?? mod;
    _openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return _openaiClient;
  } catch (e) {
    console.warn("OpenAI client load failed:", e?.message ?? e);
    return null;
  }
}

/* getEmbeddingForText(text, { useOpenAI = true }) */
export async function getEmbeddingForText(text, { useOpenAI = true } = {}) {
  if (useOpenAI) {
    const client = await getOpenAIClient();
    if (client) {
      try {
        const resp = await client.embeddings.create({
          model: "text-embedding-3-small",
          input: text,
        });
        const emb = resp?.data?.[0]?.embedding;
        if (Array.isArray(emb)) return normalizeVector(emb);
      } catch (e) {
        console.warn("OpenAI embedding failed:", e?.message ?? e);
      }
    }
  }
  return fallbackEmbeddingFromText(String(text || ""));
}

/* findSimilarByEmbedding(vec, { topK = 20 }) */
export async function findSimilarByEmbedding(vec, { topK = 20 } = {}) {
  if (!Array.isArray(vec) || vec.length === 0) return [];
  const docs = await Book.find({ embedding: { $exists: true, $ne: [] } }).select("_id embedding").lean().limit(2000);
  const out = [];
  for (const d of docs) {
    if (!d.embedding || !Array.isArray(d.embedding)) continue;
    const score = cosineSimilarity(vec, d.embedding);
    out.push({ book: d, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, Math.max(0, topK));
}

export default { getEmbeddingForText, normalizeVector, findSimilarByEmbedding, cosineSimilarity };