// backend/src/controllers/analytics.controller.js
// Reading analytics controller.
//
// Responsibilities:
// - Provide user-scoped reading analytics
// - Expose summary stats, monthly trends, streaks, and heatmap data
//
// Assumptions:
// - All routes are authenticated
// - req.user.id is a valid Mongo ObjectId
// - All analytics are based on Reading.updatedAt timestamps

import Reading from "../models/Reading.js";
import mongoose from "mongoose";

/* ======================================================
   READING SUMMARY
====================================================== */

/**
 * GET /api/analytics/reading/summary
 *
 * Returns high-level reading counts.
 *
 * Note:
 * - lastUpdated represents response generation time,
 *   not the user's last reading activity.
 */
export async function getReadingSummary(req, res, next) {
  try {
    const userId = req.user.id;

    const [finished, reading, toRead, total] = await Promise.all([
      Reading.countDocuments({
        user: userId,
        status: "finished",
      }),
      Reading.countDocuments({
        user: userId,
        status: "reading",
      }),
      Reading.countDocuments({
        user: userId,
        status: "to-read",
      }),
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

/* ======================================================
   MONTHLY READING STATS
====================================================== */

/**
 * GET /api/analytics/reading/monthly
 *
 * Returns number of finished books per month.
 *
 * Notes:
 * - Grouping is based on Reading.updatedAt
 * - Month format: YYYY-MM
 */
export async function getMonthlyReadingStats(req, res, next) {
  try {
    const userId = req.user.id;

    const data = await Reading.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
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
      {
        $sort: {
          "_id.year": 1,
          "_id.month": 1,
        },
      },
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

/* ======================================================
   READING STREAKS
====================================================== */

/**
 * GET /api/analytics/reading/streaks
 *
 * Returns current and longest reading streaks.
 *
 * Definitions:
 * - A streak is based on consecutive days with reading activity
 * - Activity is determined by Reading.updatedAt
 * - Today and yesterday are both considered active for current streak
 */
export async function getReadingStreaks(req, res, next) {
  try {
    const userId = req.user.id;

    const readings = await Reading.find({
      user: userId,
    })
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

    // Normalize to unique YYYY-MM-DD dates
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

        tempStreak = diff === 1 ? tempStreak + 1 : 1;
      }

      longestStreak = Math.max(longestStreak, tempStreak);

      // Determine current streak only once
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

/* ======================================================
   READING HEATMAP
====================================================== */

/**
 * GET /api/analytics/reading/heatmap
 *
 * Query params:
 * - days (30–365, default 180)
 *
 * Returns GitHub-style daily activity heatmap data.
 * Missing days are filled with count = 0.
 */
export async function getReadingHeatmap(req, res, next) {
  try {
    const userId = req.user.id;

    const days = Math.min(
      365,
      Math.max(30, parseInt(req.query.days || "180", 10))
    );

    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days + 1);

    // Aggregate reading activity per day
    const rows = await Reading.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          updatedAt: { $gte: from, $lte: to },
        },
      },
      {
        $project: {
          day: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$updatedAt",
            },
          },
        },
      },
      {
        $group: {
          _id: "$day",
          count: { $sum: 1 },
        },
      },
    ]);

    // Convert aggregation results to lookup map
    const map = {};
    rows.forEach((r) => {
      map[r._id] = r.count;
    });

    // Fill missing days with zero counts
    const daysArray = [];
    const cursor = new Date(from);

    while (cursor <= to) {
      const key = cursor.toISOString().slice(0, 10);

      daysArray.push({
        date: key,
        count: map[key] || 0,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    res.json({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      days: daysArray,
    });
  } catch (err) {
    next(err);
  }
}
