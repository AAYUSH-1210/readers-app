// backend/src/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import { Server as IOServer } from "socket.io";
import { connectDB } from "./config/db.js";

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

import { initSocket } from "./utils/socketService.js";

console.log("MONGO_URI present?", Boolean(process.env.MONGO_URI));
console.log("JWT_SECRET present?", Boolean(process.env.JWT_SECRET));

const app = express();
const PORT = process.env.PORT || 5000;

// configure CORS for HTTP routes
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json());

// health
app.get("/", (req, res) => res.send("📚 Readers API running"));

// mount routes (ensure each route file uses `export default router;`)
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

// generic error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err && err.stack ? err.stack : err);
  const status = err?.status || 500;
  res.status(status).json({
    message: status === 500 ? "Internal Server Error" : err?.message || "Error",
  });
});

// Start the HTTP server with Socket.IO after DB connection
connectDB()
  .then(() => {
    // create an HTTP server from Express app so we can attach socket.io
    const httpServer = http.createServer(app);

    // configure Socket.IO
    const io = new IOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
      // transports: ["websocket", "polling"], // adjust if needed
    });

    // initialize your socket handling (this should set io in a module-level helper)
    try {
      initSocket(io);
      console.log("Socket.IO initialized");
    } catch (e) {
      console.error("initSocket failed:", e && e.stack ? e.stack : e);
    }

    // start listening and handle listen errors gracefully
    httpServer.on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Kill the process using it or change PORT.`
        );
      } else {
        console.error("HTTP server error:", err && err.stack ? err.stack : err);
      }
      process.exit(1);
    });

    httpServer.listen(PORT, () => {
      console.log(
        `🚀 Server (HTTP + Socket.IO) started on http://localhost:${PORT}`
      );
    });

    // graceful shutdown helpers
    const shutdown = (signal) => {
      console.log(`Received ${signal}. Shutting down server...`);
      httpServer.close((err) => {
        if (err) {
          console.error("Error closing HTTP server:", err);
          process.exit(1);
        }
        // close DB connection if your connectDB exposes it, otherwise rely on process exit
        console.log("HTTP server closed. Exiting process.");
        process.exit(0);
      });
      // force exit after timeout
      setTimeout(() => {
        console.warn("Forcing exit after 10s");
        process.exit(1);
      }, 10_000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  })
  .catch((err) => {
    console.error("Failed to connect DB", err && err.stack ? err.stack : err);
    process.exit(1);
  });
