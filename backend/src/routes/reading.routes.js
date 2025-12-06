import express from "express";
const router = express.Router();

router.get("/", (req, res) => res.json({ message: "reading root" }));

export default router;
