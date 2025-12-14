import express from "express";
import auth from "../middleware/auth.js";
import {
  createDiscussion,
  listDiscussions,
  getDiscussion,
} from "../controllers/bookclubDiscussion.controller.js";

const router = express.Router();

/* Club discussions */
router.get("/bookclubs/:clubId/discussions", listDiscussions);
router.post("/bookclubs/:clubId/discussions", auth, createDiscussion);

/* Single discussion */
router.get("/discussions/:id", getDiscussion);

export default router;
