import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";
import Note from "../models/Note.js";
import Review from "../models/Review.js";

function clean(doc) {
  const obj = { ...doc };
  delete obj._id;
  delete obj.__v;
  return obj;
}

export async function exportAll(req, res, next) {
  try {
    const userId = req.user.id;

    const [reading, shelves, shelfItems, notes, reviews] = await Promise.all([
      Reading.find({ user: userId }).lean(),
      Shelf.find({ user: userId }).lean(),
      ShelfItem.find({}).populate("shelf").lean(),
      Note.find({ user: userId }).lean(),
      Review.find({ user: userId }).lean(),
    ]);

    const ownedShelfIds = new Set(shelves.map((s) => String(s._id)));
    const ownedShelfItems = shelfItems.filter(
      (i) => i.shelf && ownedShelfIds.has(String(i.shelf._id))
    );

    res.json({
      meta: {
        version: 1,
        exportedAt: new Date().toISOString(),
        userId,
      },
      data: {
        reading: reading.map(clean),
        shelves: shelves.map(clean),
        shelfItems: ownedShelfItems.map(clean),
        notes: notes.map(clean),
        reviews: reviews.map(clean),
      },
    });
  } catch (err) {
    next(err);
  }
}
