// backend/src/config/db.js
// Centralized MongoDB connection setup using Mongoose.
// This module is intentionally minimal and side-effect free
// except for establishing and monitoring the database connection.

import mongoose from "mongoose";

/**
 * Establishes a connection to MongoDB.
 * - Validates required environment variables
 * - Applies stable connection options
 * - Attaches lifecycle event listeners for observability
 */
export const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  // Fail fast if configuration is missing
  if (!uri) {
    throw new Error("MONGO_URI not set in environment variables");
  }

  try {
    // Explicit options for stability and forward compatibility
    await mongoose.connect(uri, {
      autoIndex: true, // build indexes on startup (safe for development & small prod)
      serverSelectionTimeoutMS: 5000, // fail fast if MongoDB is unreachable
    });

    console.log("✅ MongoDB connected");

    // Connection lifecycle logging (non-intrusive, for debugging & ops)
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected");
    });
  } catch (err) {
    // Provide context while preserving original error behavior
    console.error("❌ Failed to connect to MongoDB:", err.message);
    throw err;
  }
};
