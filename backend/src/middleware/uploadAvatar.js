// backend/src/middleware/uploadAvatar.js
// Middleware for handling avatar uploads.
// Uses in-memory storage and streams directly to Cloudinary
// to avoid temporary disk writes.

import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

// Configure multer to use memory storage with a safe file size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max avatar size
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"), false);
    }
    cb(null, true);
  },
});

/**
 * Uploads avatar image to Cloudinary and attaches the URL to req.avatarUrl.
 * Must be used after multer middleware.
 */
export function uploadAvatar(req, res, next) {
  // No file uploaded — proceed without modifying request
  if (!req.file) return next();

  const stream = cloudinary.uploader.upload_stream(
    {
      folder: "readers_app/avatars",
      transformation: [{ width: 400, height: 400, crop: "fill" }],
    },
    (err, result) => {
      if (err) {
        console.error("Cloudinary upload error:", err);
        return res.status(500).json({ message: "Upload failed" });
      }

      // Attach Cloudinary URL for downstream handlers
      req.avatarUrl = result.secure_url;
      return next();
    }
  );

  // Convert in-memory buffer to readable stream and pipe to Cloudinary
  streamifier.createReadStream(req.file.buffer).pipe(stream);
}

// Export multer middleware for single avatar upload
export default upload.single("avatar");
