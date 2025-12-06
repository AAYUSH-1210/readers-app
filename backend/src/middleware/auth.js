// backend/src/middleware/auth.js
import jwt from "jsonwebtoken";

/**
 * Auth middleware
 * - Expects header: Authorization: Bearer <token>
 * - On success attaches req.user = { id: "<userId>" }
 * - On failure returns 401
 */
export default function auth(req, res, next) {
  try {
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== "string") {
      return res.status(401).json({ message: "No authorization header provided" });
    }

    const parts = header.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ message: "Malformed authorization header" });
    }

    const token = parts[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("JWT_SECRET is not set in process.env");
      return res.status(500).json({ message: "Server misconfigured: missing JWT secret" });
    }

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // payload expected to contain userId
    if (!payload || !payload.userId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // attach simple user context for downstream handlers
    req.user = { id: payload.userId };
    return next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ message: "Server error in auth middleware" });
  }
}
