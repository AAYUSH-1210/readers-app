// backend/src/routes/search.routes.js
import express from "express";
import { searchBooks, searchUsers } from "../controllers/search.controller.js";

const router = express.Router();

router.get("/", searchBooks);
router.get("/users", searchUsers);

export default router;
