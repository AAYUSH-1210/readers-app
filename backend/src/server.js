// backend/src/server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
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

console.log("MONGO_URI present?", Boolean(process.env.MONGO_URI));
console.log("JWT_SECRET present?", Boolean(process.env.JWT_SECRET));

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// health
app.get("/", (req, res) => res.send("📚 Readers API running"));

// mount routes (ensure each route file uses `export default router;`)
app.use("/api/auth", authRoutes);
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
  console.error("Unhandled error:", err);
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

// start server after DB connected
connectDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`🚀 Server started on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("Failed to connect DB", err);
    // decide: exit in production, but in dev we may want to keep process alive
    process.exit(1); // keep this if you want the process to stop on DB failure
    // OR: do not exit in dev — comment out the above line
  });
