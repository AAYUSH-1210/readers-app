// backend/src/utils/activityLogger.js
import Activity from "../models/Activity.js";

export async function logActivity({
  user,
  type,
  action,
  book = null,
  meta = {},
}) {
  try {
    await Activity.create({
      user,
      type,
      action,
      book,
      meta,
    });
  } catch (err) {
    console.error("Activity log failed:", err.message);
  }
}
