// backend/src/routes/auth.routes.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { body, validationResult } from "express-validator";

const router = express.Router();

/**
 * POST /api/auth/signup
 * body: { name, username, email, password }
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
      // validationResult
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array().map((e) => ({ field: e.param, msg: e.msg })),
        });
      }

      const { name, username, email, password } = req.body;

      // check existing by email or username
      const existing = await User.findOne({
        $or: [{ email: email.toLowerCase() }, { username }],
      });
      if (existing) {
        return res
          .status(400)
          .json({ message: "User with that email or username already exists" });
      }

      // hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const user = await User.create({
        name,
        username,
        email: email.toLowerCase(),
        passwordHash,
      });

      // create token
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return res.status(500).json({ message: "Server misconfigured" });
      }
      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "7d",
      });

      res.status(201).json({
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
      console.error("signup error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /api/auth/login
 * body: { emailOrUsername, password }
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
      // validationResult
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          errors: errors.array().map((e) => ({ field: e.param, msg: e.msg })),
        });
      }

      const { emailOrUsername, password } = req.body;

      // find by email (lowercased) or username
      const queryEmail = emailOrUsername.includes("@")
        ? emailOrUsername.toLowerCase()
        : null;

      const user = await User.findOne({
        $or: [
          { email: queryEmail || undefined },
          { username: emailOrUsername },
        ].filter(Boolean),
      });

      if (!user)
        return res.status(400).json({ message: "Invalid credentials" });

      const match = await bcrypt.compare(password, user.passwordHash);
      if (!match)
        return res.status(400).json({ message: "Invalid credentials" });

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("JWT_SECRET not configured");
        return res.status(500).json({ message: "Server misconfigured" });
      }

      const token = jwt.sign({ userId: user._id }, jwtSecret, {
        expiresIn: "7d",
      });

      res.json({
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
      console.error("login error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
