import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import {
  previewImport,
  confirmImport,
} from "./import.controller.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const filename = file.originalname.toLowerCase();

    if (filename.endsWith(".xlsx") || filename.endsWith(".csv")) {
      return callback(null, true);
    }

    callback(new Error("Only .xlsx and .csv files are allowed."));
  },
});

router.use(authenticate, authorize("owner"));

router.post("/preview", upload.single("file"), previewImport);
router.post("/:id/commit", confirmImport);

export default router;