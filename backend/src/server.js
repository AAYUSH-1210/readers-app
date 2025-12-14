// backend/src/server.js
import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";
import express from "express";
import cors from "cors";
import http from "http";
import { Server as IOServer } from "socket.io";

import { connectDB } from "./config/db.js";
import { initSocket } from "./utils/socketService.js";
import { setIo } from "./utils/socket.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import bookRoutes from "./routes/book.routes.js";
import readingRoutes from "./routes/reading.routes.js";
import searchRoutes from "./routes/search.routes.js";
import meRoutes from "./routes/me.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import favoriteRoutes from "./routes/favorite.routes.js";
import shelfRoutes from "./routes/shelf.routes.js";
import smartShelfRoutes from "./routes/smartShelf.routes.js";
import noteRoutes from "./routes/note.routes.js";
import activityRoutes from "./routes/activity.routes.js";
import profileRoutes from "./routes/profile.routes.js";
import followRoutes from "./routes/follow.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import likeRoutes from "./routes/like.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import recommendRoutes from "./routes/recommend.routes.js";
import mlrecRoutes from "./routes/mlrec.routes.js";
import feedRouter from "./routes/feed.routes.js";
import trendingRouter from "./routes/trending.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";

console.log("MONGO_URI present?", Boolean(process.env.MONGO_URI));
console.log("JWT_SECRET present?", Boolean(process.env.JWT_SECRET));

const app = express();
const PORT = process.env.PORT || 5000;

/* -------------------- MIDDLEWARE -------------------- */

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json());

/* -------------------- HEALTH -------------------- */

app.get("/", (req, res) => res.send("📚 Readers API running"));

/* -------------------- ROUTES -------------------- */

app.use("/api/auth", authRoutes);
app.use("/api/books/trending", trendingRouter);
app.use("/api/books", bookRoutes);
app.use("/api/reading", readingRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/me", meRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/shelves", shelfRoutes);
app.use("/api/smart-shelves", smartShelfRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/follow", followRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/likes", likeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/recommend", recommendRoutes);
app.use("/api/mlrec", mlrecRoutes);
app.use("/api/feed", feedRouter);
app.use("/api/analytics", analyticsRoutes);

/* -------------------- ERROR HANDLER -------------------- */

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err?.status || 500).json({
    message: err?.message || "Internal Server Error",
  });
});

/* -------------------- START SERVER -------------------- */

connectDB()
  .then(() => {
    const httpServer = http.createServer(app);

    const io = new IOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // 🔐 JWT AUTH FOR SOCKETS
    io.use((socket, next) => {
      try {
        const token =
          socket.handshake?.auth?.token || socket.handshake?.query?.token;
        if (!token) return next(new Error("auth error"));

        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const userId = payload?.id || payload?.userId || payload?._id;
        if (!userId) return next(new Error("auth error"));

        socket.user = { id: String(userId), ...payload };
        next();
      } catch (err) {
        next(new Error("auth error"));
      }
    });

    // ✅ SINGLE SOCKET INITIALIZATION
    initSocket(io);
    setIo(io);

    httpServer.listen(PORT, () => {
      console.log(
        `🚀 Server (HTTP + Socket.IO) started on http://localhost:${PORT}`
      );
    });
  })
  .catch((err) => {
    console.error("Failed to connect DB", err);
    process.exit(1);
  });
