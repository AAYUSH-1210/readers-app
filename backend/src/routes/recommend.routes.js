// backend/src/routes/recommend.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  recommendForMe,
  similarToBook,
  getPopular,
} from "../controllers/recommend.controller.js";
const router = express.Router();

/* personalized recommendations (requires auth) */
router.get("/me", auth, recommendForMe);

/* similar books to a book */
router.get("/similar/:bookId", similarToBook);

/* popular */
router.get("/popular", getPopular);

export default router;
