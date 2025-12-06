// backend/src/routes/search.routes.js
import express from "express";
import { searchBooks } from "../controllers/search.controller.js";

const router = express.Router();

router.get("/", searchBooks);

export default router;
