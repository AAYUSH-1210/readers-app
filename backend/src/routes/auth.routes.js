import express from "express";
const router = express.Router();

// simple stub
router.get("/", (req, res) => res.json({ message: "auth root" }));

export default router;
