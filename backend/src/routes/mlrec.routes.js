// backend/src/routes/mlrec.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  computeAllEmbeddings,
  similarByML,
} from "../controllers/mlrec.controller.js";

const router = express.Router();

// Recompute corpus embeddings (protected to avoid accidental calls)
router.post("/compute-all", auth, computeAllEmbeddings);

// Public similar-by-ml endpoint
router.get("/similar/:bookId", similarByML);

export default router;
