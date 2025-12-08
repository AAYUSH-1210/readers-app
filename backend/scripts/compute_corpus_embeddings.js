// backend/scripts/compute_corpus_embeddings.js
import mongoose from "mongoose";
import dotenv from "dotenv";

// Load backend .env file explicitly
dotenv.config({ path: "./backend/.env" });

import { saveCorpusEmbeddingsToDB } from "../src/utils/embeddings.js";

async function main() {
  console.log("MONGO_URI =", process.env.MONGO_URI); // debug
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const updated = await saveCorpusEmbeddingsToDB();
  console.log("Embeddings computed and saved for", updated, "books");

  await mongoose.disconnect();
  console.log("Disconnected");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
