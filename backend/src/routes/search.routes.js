import express from "express";
const router = express.Router();

router.get("/books", (req, res) => res.json({ message: "search books stub" }));

export default router;
