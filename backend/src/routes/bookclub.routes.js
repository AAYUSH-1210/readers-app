import express from "express";
import auth from "../middleware/auth.js";
import {
  createClub,
  listPublicClubs,
  getClubDetails,
  joinClub,
  leaveClub,
  listClubMembers,
} from "../controllers/bookclub.controller.js";
import {
  joinBookClub,
  leaveBookClub,
} from "../controllers/bookclub.controller.js";

const router = express.Router();

router.get("/", listPublicClubs);
router.post("/", auth, createClub);

router.get("/:id", getClubDetails);
router.post("/:id/join", auth, joinClub);
router.post("/:id/leave", auth, leaveClub);
router.get("/:id/members", listClubMembers);
router.post("/:clubId/join", auth, joinBookClub);
router.post("/:clubId/leave", auth, leaveBookClub);

export default router;
