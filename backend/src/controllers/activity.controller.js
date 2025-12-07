// backend/src/controllers/activity.controller.js
import Activity from "../models/Activity.js";

/* GET /api/activity/my */
export async function getMyActivity(req, res, next) {
  try {
    const userId = req.user.id;

    const items = await Activity.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("book")
      .populate("user", "name username avatarUrl");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/* GET /api/activity/user/:userId */
export async function getActivityForUser(req, res, next) {
  try {
    const userId = req.params.userId;

    const items = await Activity.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("book")
      .populate("user", "name username avatarUrl");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/* GET /api/activity/global */
export async function getGlobalActivity(req, res, next) {
  try {
    const items = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("book")
      .populate("user", "name username avatarUrl");

    res.json({ items });
  } catch (err) {
    next(err);
  }
}
