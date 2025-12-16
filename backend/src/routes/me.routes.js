// backend/src/routes/me.routes.js
//
// Me Routes
//
// Responsibilities:
// - Return the currently authenticated user's profile
// - Used for session validation and app bootstrap
//
// Notes:
// - Requires authentication
// - Sensitive fields (passwordHash) are excluded
// - No mutations or side effects
//
// Base path:
// - /api/me
//

import express from "express";
import auth from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

/* ======================================================
   GET /api/me
====================================================== */
/**
 * Get current authenticated user.
 *
 * Auth required.
 *
 * Response:
 * - user (User document without passwordHash)
 */
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({ user });
  } catch (err) {
    console.error("GET /api/me error:", err);
    res.status(500).json({
      message: "Server error",
    });
  }
});

export default router;
