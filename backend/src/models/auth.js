// backend/src/middleware/auth.js
import jwt from "jsonwebtoken";

export default function auth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ message: "JWT_SECRET not configured" });

    const payload = jwt.verify(token, secret);
    // payload should include userId
    req.user = { id: payload.userId };
    next();
  } catch (err) {
    console.error("auth middleware error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
