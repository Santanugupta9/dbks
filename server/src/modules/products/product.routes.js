import { Router } from "express";
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  listCategories,
  createCategory,
} from "./product.controller.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

const router = Router();

router.get("/", (req, res, next) => {
  // Public catalog access; authentication is optional.
  const header = req.headers.authorization;

  if (!header) return listProducts(req, res, next);

  return authenticate(req, res, () => listProducts(req, res, next));
});

router.get("/categories", listCategories);
router.get("/:id", (req, res, next) => {
  if (!req.headers.authorization) return getProduct(req, res, next);
  return authenticate(req, res, () => getProduct(req, res, next));
});

router.post(
  "/",
  authenticate,
  authorize("owner"),
  createProduct
);

router.patch(
  "/:id",
  authenticate,
  authorize("owner"),
  updateProduct
);

router.post(
  "/categories",
  authenticate,
  authorize("owner"),
  createCategory
);

export default router;