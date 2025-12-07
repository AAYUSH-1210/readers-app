import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

// Use memory storage because we upload directly to Cloudinary
const upload = multer({ storage: multer.memoryStorage() });

// This wrapper uploads file buffer to Cloudinary
export function uploadAvatar(req, res, next) {
  if (!req.file) return next(); // No file uploaded

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

      // Save Cloudinary URL to request
      req.avatarUrl = result.secure_url;
      next();
    }
  );

  // Convert buffer to stream
  streamifier.createReadStream(req.file.buffer).pipe(stream);
}

export default upload.single("avatar");
