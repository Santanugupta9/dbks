import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  listParties,
  getParty,
  createParty,
  updateParty,
} from "./party.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", authorize("owner", "salesman"), listParties);
router.get("/:id", authorize("owner", "salesman"), getParty);

router.post("/", authorize("owner"), createParty);
router.patch("/:id", authorize("owner"), updateParty);

export default router;