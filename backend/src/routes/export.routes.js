import express from "express";
import auth from "../middleware/auth.js";
import { exportAll } from "../controllers/export.controller.js";

const router = express.Router();

router.get("/all", auth, exportAll);

export default router;
