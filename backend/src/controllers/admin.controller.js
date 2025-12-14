import User from "../models/User.js";
import Review from "../models/Review.js";

/* ================= USERS ================= */

export async function listUsers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find()
        .select("-passwordHash")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(),
    ]);

    res.json({ page, limit, total, users });
  } catch (err) {
    next(err);
  }
}

export async function banUser(req, res, next) {
  try {
    const { userId } = req.params;
    const { banned } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isBanned: Boolean(banned) },
      { new: true }
    ).select("username isBanned");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (err) {
    next(err);
  }
}

/* ================= REVIEWS ================= */

export async function listReviews(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.deleted === "true") filter.isDeleted = true;
    if (req.query.deleted === "false") filter.isDeleted = false;

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("user", "username")
        .populate("book", "title")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    res.json({ page, limit, total, reviews });
  } catch (err) {
    next(err);
  }
}

export async function softDeleteReview(req, res, next) {
  try {
    const { reviewId } = req.params;

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { isDeleted: true },
      { new: true }
    );

    if (!review) return res.status(404).json({ message: "Review not found" });

    res.json({ review });
  } catch (err) {
    next(err);
  }
}

export async function restoreReview(req, res, next) {
  try {
    const { reviewId } = req.params;

    const review = await Review.findByIdAndUpdate(
      reviewId,
      { isDeleted: false },
      { new: true }
    );

    if (!review) return res.status(404).json({ message: "Review not found" });

    res.json({ review });
  } catch (err) {
    next(err);
  }
}
