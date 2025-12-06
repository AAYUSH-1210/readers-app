// backend/src/routes/reading.routes.js
import express from "express";
import auth from "../middleware/auth.js";
import {
  addToReading,
  getReadingList,
  updateReading,
  removeReading,
  checkBookInList,
} from "../controllers/reading.controller.js";
import { body, param, query, validationResult } from "express-validator";

const router = express.Router();

/* ------------------ helper middleware ------------------ */
function validate(rules) {
  return async (req, res, next) => {
    for (let rule of rules) {
      await rule.run(req);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map((e) => ({ field: e.path, msg: e.msg })),
      });
    }

    next();
  };
}

/* ------------------ POST /add ------------------ */
router.post(
  "/add",
  auth,
  validate([
    body("externalId")
      .notEmpty()
      .withMessage("externalId is required")
      .isString()
      .withMessage("externalId must be a string"),

    body("title").notEmpty().withMessage("title is required"),

    body("authors")
      .optional()
      .isArray()
      .withMessage("authors must be an array of strings"),

    body("cover")
      .optional()
      .isString()
      .withMessage("cover must be a string URL"),

    body("source").optional().isString().withMessage("source must be a string"),
  ]),
  addToReading
);

/* ------------------ GET /list ------------------ */
router.get("/list", auth, getReadingList);

/* ------------------ PATCH /:id ------------------ */
router.patch(
  "/:id",
  auth,
  validate([
    param("id").isMongoId().withMessage("Invalid reading entry ID"),

    body("progress")
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage("progress must be between 0 and 100"),

    body("status")
      .optional()
      .isIn(["to-read", "reading", "finished"])
      .withMessage("Invalid status value"),

    body("notes").optional().isString().withMessage("notes must be a string"),
  ]),
  updateReading
);

/* ------------------ DELETE /:id ------------------ */
router.delete(
  "/:id",
  auth,
  validate([param("id").isMongoId().withMessage("Invalid reading entry ID")]),
  removeReading
);

/* ------------------ GET /check ------------------ */
// /api/reading/check?externalId=/works/OL82563W
router.get(
  "/check",
  auth,
  validate([
    query("externalId")
      .notEmpty()
      .withMessage("externalId is required in query"),
  ]),
  checkBookInList
);

export default router;
