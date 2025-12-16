// backend/src/routes/auth.routes.js
//
// Authentication Routes
//
// Responsibilities:
// - User signup (account creation)
// - User login (JWT-based authentication)
//
// Security:
// - Passwords are hashed using bcrypt
// - JWT is signed using process.env.JWT_SECRET
//
// Notes:
// - This file intentionally does NOT use controllers
//   because auth logic is tightly coupled to validation & JWT
// - Token payload: { userId }
//
// Route prefix:
// - /api/auth
//

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { body, validationResult } from "express-validator";
import User from "../models/User.js";

const router = express.Router();

/* ======================================================
   SIGNUP
   POST /api/auth/signup
====================================================== */
/**
 * Body:
 * - name (string, required)
 * - username (string, required, unique)
 * - email (string, required, unique)
 * - password (string, required, min 6 chars)
 */
router.post(
  "/signup",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("username")
      .trim()
      .notEmpty()
      .withMessage("Username is required")
      .isLength({ min: 3 })
      .withMessage("Username must be at least 3 characters")
      .matches(/^[a-zA-Z0-9._-]+$/)
      .withMessage("Username can contain letters, numbers, . _ -"),
    body("email")
      .trim()
      .notEmpty()
      .withMessage("Email is required")
      .isEmail()
      .withMessage("Email is invalid"),
    body("password")
      .notEmpty()
      .withMessage("Password is required")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      /* ---------- Validation ---------- */
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array().map((e) => ({
            field: e.param,
            msg: e.msg,
          })),
        });
      }

      const { name, username, email, password } = req.body;

      /* ---------- Check existing user ---------- */
      const existing = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { username }],
      });

      if (existing) {
        return res.status(400).json({
          message: "User with that email or username already exists",
        });
      }

      /* ---------- Hash password ---------- */
      const passwordHash = await bcrypt.hash(password, 10);

      const user = await User.create({
        name,
        username,
        email: email.toLowerCase(),
        passwordHash,
      });

      /* ---------- JWT ---------- */
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return res.status(500).json({ message: "Server misconfigured" });
      }

      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "7d",
      });

      return res.status(201).json({
        token,
        user: user.toClient
          ? user.toClient()
          : {
              id: user._id,
              name: user.name,
              username: user.username,
              email: user.email,
            },
      });
    } catch (err) {
      console.error("[AUTH] signup error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ======================================================
   LOGIN
   POST /api/auth/login
====================================================== */
/**
 * Body:
 * - emailOrUsername (string, required)
 * - password (string, required)
 */
router.post(
  "/login",
  [
    body("emailOrUsername")
      .trim()
      .notEmpty()
      .withMessage("Email or username required"),
    body("password").notEmpty().withMessage("Password required"),
  ],
  async (req, res) => {
    try {
      /* ---------- Validation ---------- */
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array().map((e) => ({
            field: e.param,
            msg: e.msg,
          })),
        });
      }

      const { emailOrUsername, password } = req.body;

      /* ---------- Resolve user ---------- */
      const queryEmail = emailOrUsername.includes("@")
        ? emailOrUsername.toLowerCase()
        : null;

      const user = await User.findOne({
        $or: [
          queryEmail ? { email: queryEmail } : null,
          { username: emailOrUsername },
        ].filter(Boolean),
      });

      if (!user) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match) {
        return res.status(400).json({ message: "Invalid credentials" });
      }

      /* ---------- JWT ---------- */
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return res.status(500).json({ message: "Server misconfigured" });
      }

      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "7d",
      });

      return res.json({
        token,
        user: user.toClient
          ? user.toClient()
          : {
              id: user._id,
              name: user.name,
              username: user.username,
              email: user.email,
            },
      });
    } catch (err) {
      console.error("[AUTH] login error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
