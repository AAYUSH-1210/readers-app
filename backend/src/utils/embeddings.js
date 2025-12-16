/* backend/src/utils/embeddings.js
   Minimal and safe embeddings helper used for:
   - Content-based recommendations
   - Similarity scoring
   - Tests and local development

   Design goals:
   - Never fail if external embedding providers are unavailable
   - Provide deterministic fallback embeddings
   - Keep math simple and predictable

   Exports:
   - getEmbeddingForText
   - normalizeVector
   - findSimilarByEmbedding
   - cosineSimilarity
*/

import Book from "../models/Book.js";

/**
 * Normalizes a vector using L2 norm.
 * Returns the original vector if invalid or zero-length.
 */
export function normalizeVector(v) {
  if (!Array.isArray(v) || v.length === 0) return v;

  const norm = Math.sqrt(v.reduce((s, x) => s + (x || 0) ** 2, 0));

  if (norm === 0) return v;

  return v.map((x) => (x || 0) / norm);
}

/**
 * Computes cosine similarity between two vectors.
 * Uses the minimum common length to stay defensive.
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;

  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;

  for (let i = 0; i < n; i++) {
    const va = a[i] || 0;
    const vb = b[i] || 0;

    dot += va * vb;
    na += va ** 2;
    nb += vb ** 2;
  }

  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;

  return dot / denom;
}

/**
 * Deterministic fallback embedding generator.
 * Used when OpenAI is unavailable or disabled.
 */
function fallbackEmbeddingFromText(text = "") {
  const L = 64; // fixed dimensionality for stability
  const v = new Array(L).fill(0);

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const idx = i % L;
    v[idx] += (code % 13) + (code % 7);
  }

  // scale down values for numerical stability
  for (let i = 0; i < L; i++) {
    v[i] = v[i] / 100.0;
  }

  return normalizeVector(v);
}

/**
 * Lazy-load OpenAI client.
 * Returns null if OPENAI_API_KEY is missing or client load fails.
 */
let _openaiClient = null;

async function getOpenAIClient() {
  if (_openaiClient) return _openaiClient;
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const mod = await import("openai");
    const OpenAI = mod?.OpenAI ?? mod?.default ?? mod;
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    return _openaiClient;
  } catch (e) {
    console.warn("OpenAI client load failed:", e?.message ?? e);
    return null;
  }
}

/**
 * Generates an embedding for text.
 * Falls back to deterministic embedding if OpenAI is unavailable or fails.
 */
export async function getEmbeddingForText(text, { useOpenAI = true } = {}) {
  const inputText = String(text || "");

  if (useOpenAI) {
    const client = await getOpenAIClient();
    if (client) {
      try {
        const resp = await client.embeddings.create({
          model: "text-embedding-3-small",
          input: inputText,
        });

        const emb = resp?.data?.[0]?.embedding;
        if (Array.isArray(emb)) {
          return normalizeVector(emb);
        }
      } catch (e) {
        console.warn("OpenAI embedding failed:", e?.message ?? e);
      }
    }
  }

  return fallbackEmbeddingFromText(inputText);
}

/**
 * Finds similar books based on cosine similarity.
 * Caps DB scan size to avoid unbounded memory usage.
 */
export async function findSimilarByEmbedding(vec, { topK = 20 } = {}) {
  if (!Array.isArray(vec) || vec.length === 0) return [];

  // Limit scan size to keep operation bounded
  const docs = await Book.find({
    embedding: { $exists: true, $ne: [] },
  })
    .select("_id embedding")
    .lean()
    .limit(2000);

  const out = [];

  for (const d of docs) {
    if (!Array.isArray(d.embedding)) continue;
    const score = cosineSimilarity(vec, d.embedding);
    out.push({ book: d, score });
  }

  out.sort((a, b) => b.score - a.score);

  return out.slice(0, Math.max(0, topK));
}

export default {
  getEmbeddingForText,
  normalizeVector,
  findSimilarByEmbedding,
  cosineSimilarity,
};
