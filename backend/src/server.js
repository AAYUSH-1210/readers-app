// backend/src/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { connectDB } from "./config/db.js";

// placeholder routes (we'll replace/add files later)
import authRoutes from "./routes/auth.routes.js";
import bookRoutes from "./routes/book.routes.js";
import readingRoutes from "./routes/reading.routes.js";
import searchRoutes from "./routes/search.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// health check
app.get("/", (req, res) => res.send("📚 Readers API running"));

// mount routes (these files can be created as stubs if not present yet)
app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/reading", readingRoutes);
app.use("/api/search", searchRoutes);

// start
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server started on http://localhost:${PORT}`);
  });
});
