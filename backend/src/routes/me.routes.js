// backend/src/routes/me.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import User from "../models/User.js";

const router = express.Router();

// GET /api/me  <-- router is mounted at /api/me in server.js
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error("GET /api/me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
