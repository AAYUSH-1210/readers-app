import express from "express";
import auth from "../middleware/auth.js";
import { importAll } from "../controllers/import.controller.js";

const router = express.Router();

router.post("/all", auth, importAll);

export default router;
