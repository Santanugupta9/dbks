import { Router } from "express";
import {
  login,
  logout,
  refresh,
  me,
} from "./auth.controller.js";
import { authenticate } from "../../middleware/authenticate.js";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.get("/me", authenticate, me);

export default router;