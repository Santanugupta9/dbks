
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";

import {
  createOrder,
  listOrders,
  getOrder,
  updateOrder,
  confirmOrder,
  cancelOrder,
  requestAmendment,
} from "./order.controller.js";

const router = Router();

// All order routes require a valid login.
router.use(authenticate);

// Create and view orders.
router.post(
  "/",
  authorize("owner", "salesman", "customer"),
  createOrder
);

router.get(
  "/",
  authorize("owner", "salesman", "customer"),
  listOrders
);

router.get(
  "/:id",
  authorize("owner", "salesman", "customer"),
  getOrder
);

// Direct edits are limited to pending orders in the service.
router.patch(
  "/:id",
  authorize("owner", "salesman", "customer"),
  updateOrder
);

// Only the owner can confirm or cancel.
router.post(
  "/:id/confirm",
  authorize("owner"),
  confirmOrder
);

router.post(
  "/:id/cancel",
  authorize("owner"),
  cancelOrder
);

// Request a controlled change to a confirmed/dispatched order.
router.post(
  "/:id/amendments",
  authorize("owner", "salesman", "customer"),
  requestAmendment
);

export default router;
