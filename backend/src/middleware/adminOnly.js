// backend/src/middleware/adminOnly.js
// Authorization middleware for admin-only routes.
// Must be used after auth middleware, as it relies on req.user.id.

import User from "../models/User.js";

/**
 * Ensures the authenticated user:
 * - Exists
 * - Is not banned
 * - Has admin role
 */
export default async function adminOnly(req, res, next) {
  try {
    // auth middleware is expected to populate req.user.id
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Fetch minimal fields required for authorization checks
    const user = await User.findById(userId).select("role isBanned").lean();

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isBanned) {
      return res.status(403).json({ message: "Account is banned" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    return next();
  } catch (err) {
    // Delegate unexpected errors to global error handler
    return next(err);
  }
}
