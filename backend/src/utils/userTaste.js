import UserBookInteraction from "../models/UserBookInteraction.js";
import Book from "../models/Book.js";

/* Create user taste vector by averaging book embeddings */
export async function computeUserTasteVector(userId) {
  const interactions = await UserBookInteraction.find({ user: userId });

  if (!interactions.length) return null;

  let sum = [];
  let totalWeight = 0;

  for (const i of interactions) {
    const book = await Book.findById(i.book).lean();
    if (!book || !book.embedding) continue;

    const w = i.weight || 1;
    totalWeight += w;

    if (sum.length === 0) sum = Array.from(book.embedding);
    else {
      for (let k = 0; k < sum.length; k++) {
        sum[k] += (book.embedding[k] || 0) * w;
      }
    }
  }

  return sum.map((v) => v / totalWeight);
}
