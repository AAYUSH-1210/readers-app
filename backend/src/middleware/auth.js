// backend/src/middleware/auth.js
// Authentication middleware for protected routes.
// Validates JWT access token and attaches a minimal user context to the request.

import jwt from "jsonwebtoken";

/**
 * Auth middleware
 * - Expects header: Authorization: Bearer <token>
 * - Verifies JWT using JWT_SECRET
 * - On success attaches: req.user = { id: "<userId>" }
 * - On failure returns appropriate HTTP error
 */
export default function auth(req, res, next) {
  try {
    // Express normalizes all headers to lowercase
    const header = req.headers.authorization;

    if (!header || typeof header !== "string") {
      return res
        .status(401)
        .json({ message: "No authorization header provided" });
    }

    // Expected format: "Bearer <token>"
    const [scheme, token] = header.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res
        .status(401)
        .json({ message: "Malformed authorization header" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      // This indicates a server configuration issue, not a client error
      console.error("JWT_SECRET is not set in process.env");
      return res
        .status(500)
        .json({ message: "Server misconfigured: missing JWT secret" });
    }

    let payload;
    try {
      payload = jwt.verify(token.trim(), secret);
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Token payload is expected to contain a userId
    if (!payload || !payload.userId) {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    // Attach minimal user context for downstream handlers
    req.user = { id: payload.userId };

    return next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ message: "Server error in auth middleware" });
  }
}
