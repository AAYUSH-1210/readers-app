import Reading from "../models/Reading.js";

/**
 * GET /api/analytics/reading/summary
 */
export async function getReadingSummary(req, res, next) {
  try {
    const userId = req.user.id;

    const [finished, reading, toRead, total] = await Promise.all([
      Reading.countDocuments({ user: userId, status: "finished" }),
      Reading.countDocuments({ user: userId, status: "reading" }),
      Reading.countDocuments({ user: userId, status: "to-read" }),
      Reading.countDocuments({ user: userId }),
    ]);

    res.json({
      totalBooks: total,
      finished,
      reading,
      toRead,
      lastUpdated: new Date(),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/reading/monthly
 */
export async function getMonthlyReadingStats(req, res, next) {
  try {
    const userId = req.user.id;

    const data = await Reading.aggregate([
      {
        $match: {
          user: Reading.db.Types.ObjectId(userId),
          status: "finished",
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$updatedAt" },
            month: { $month: "$updatedAt" },
          },
          finished: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const result = data.map((d) => ({
      month: `${d._id.year}-${String(d._id.month).padStart(2, "0")}`,
      finished: d.finished,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
}
