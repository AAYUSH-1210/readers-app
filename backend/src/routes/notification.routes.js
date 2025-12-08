// backend/src/routes/notification.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  getMyNotifications,
  markAsSeen,
  markAllAsSeen,
} from "../controllers/notification.controller.js";

const router = express.Router();

router.get("/", auth, getMyNotifications);

router.patch("/:id/seen", auth, markAsSeen);

router.patch("/mark-all/seen", auth, markAllAsSeen);

export default router;
