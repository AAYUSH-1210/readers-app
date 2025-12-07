// backend/src/routes/smartShelf.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  getAvailableShelves,
  getSmartShelfItems,
} from "../controllers/smartShelf.controller.js";
import { param, validationResult } from "express-validator";

const router = express.Router();

function validate(rules) {
  return async (req, res, next) => {
    for (const r of rules) await r.run(req);
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({
        errors: errors.array().map((e) => ({ field: e.param, msg: e.msg })),
      });
    next();
  };
}

// GET /api/smart-shelves  -> list available shelf types and counts
router.get("/", auth, getAvailableShelves);

// GET /api/smart-shelves/:type?page=1&limit=20
router.get(
  "/:type",
  auth,
  validate([param("type").notEmpty().withMessage("type required")]),
  getSmartShelfItems
);

export default router;
