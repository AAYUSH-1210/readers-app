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

console.log("MONGO_URI present?", Boolean(process.env.MONGO_URI));
console.log("JWT_SECRET present?", Boolean(process.env.JWT_SECRET));

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("📚 Readers API running"));

app.use("/api/auth", authRoutes);
app.use("/api/books", bookRoutes);
app.use("/api/reading", readingRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/auth", meRoutes);

connectDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server started on http://localhost:${PORT}`));
});
