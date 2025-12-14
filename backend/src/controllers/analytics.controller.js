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

export async function getReadingStreaks(req, res, next) {
  try {
    const userId = req.user.id;

    const readings = await Reading.find({ user: userId })
      .select("updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    if (!readings.length) {
      return res.json({
        currentStreak: 0,
        longestStreak: 0,
        lastReadDate: null,
        isActiveToday: false,
      });
    }

    // Normalize dates to YYYY-MM-DD
    const uniqueDays = [
      ...new Set(
        readings.map((r) => new Date(r.updatedAt).toISOString().slice(0, 10))
      ),
    ]
      .sort()
      .reverse();

    let currentStreak = 0;
    let longestStreak = 0;

    let prevDate = null;
    let tempStreak = 0;

    const today = new Date().toISOString().slice(0, 10);

    for (const day of uniqueDays) {
      if (!prevDate) {
        tempStreak = 1;
      } else {
        const diff =
          (new Date(prevDate) - new Date(day)) / (1000 * 60 * 60 * 24);

        if (diff === 1) {
          tempStreak += 1;
        } else {
          tempStreak = 1;
        }
      }

      longestStreak = Math.max(longestStreak, tempStreak);

      if (!currentStreak) {
        const diffFromToday =
          (new Date(today) - new Date(day)) / (1000 * 60 * 60 * 24);

        if (diffFromToday === 0 || diffFromToday === 1) {
          currentStreak = tempStreak;
        }
      }

      prevDate = day;
    }

    res.json({
      currentStreak,
      longestStreak,
      lastReadDate: uniqueDays[0],
      isActiveToday: uniqueDays[0] === today,
    });
  } catch (err) {
    next(err);
  }
}
