// backend/src/controllers/export.controller.js
//
// Data Export Controller
//
// Responsibilities:
// - Export all user-owned data in a single JSON payload
// - Support data portability and backups
// - Ensure ONLY the authenticated user's data is exported
//
// Exported entities:
// - Reading entries
// - Shelves
// - Shelf items (only items belonging to user's shelves)
// - Notes
// - Reviews
//
// Design notes:
// - This endpoint is READ-ONLY
// - No mutations are performed
// - Output is normalized and versioned for future imports
// - _id and __v are stripped from exported documents
//
// Consumers:
// - import.controller.js
// - external backup / migration tools

import Reading from "../models/Reading.js";
import Shelf from "../models/Shelf.js";
import ShelfItem from "../models/ShelfItem.js";
import Note from "../models/Note.js";
import Review from "../models/Review.js";

/* ======================================================
   Helpers
====================================================== */

/**
 * Remove Mongo-specific internal fields
 * to make export portable and clean.
 */
function clean(doc) {
  const obj = { ...doc };
  delete obj._id;
  delete obj.__v;
  return obj;
}

/* ======================================================
   GET /api/export
====================================================== */
/**
 * Export all user-owned data.
 *
 * Output format:
 * {
 *   meta: {
 *     version,
 *     exportedAt,
 *     userId
 *   },
 *   data: {
 *     reading,
 *     shelves,
 *     shelfItems,
 *     notes,
 *     reviews
 *   }
 * }
 *
 * Notes:
 * - shelfItems are filtered to include ONLY shelves owned by the user
 * - All arrays are safe to import back later
 */
export async function exportAll(req, res, next) {
  try {
    const userId = req.user.id;

    // Fetch user-owned base collections
    const [reading, shelves, notes, reviews] = await Promise.all([
      Reading.find({ user: userId }).lean(),
      Shelf.find({ user: userId }).lean(),
      Note.find({ user: userId }).lean(),
      Review.find({ user: userId }).lean(),
    ]);

    // Fetch shelf items separately (ownership resolved via shelf)
    const shelfItems = await ShelfItem.find({}).populate("shelf").lean();

    // Determine which shelf items belong to this user
    const ownedShelfIds = new Set(shelves.map((s) => String(s._id)));
    const ownedShelfItems = shelfItems.filter(
      (item) => item.shelf && ownedShelfIds.has(String(item.shelf._id))
    );

    return res.json({
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
