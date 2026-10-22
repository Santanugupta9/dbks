
import mongoose from "mongoose";
import Order from "./order.model.js";
import Product from "../products/product.model.js";
import Party from "../parties/party.model.js";

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getUserId(user) {
  return user?.id ?? user?._id;
}

function validId(id) {
  return mongoose.isValidObjectId(id);
}

function requireId(id, label) {
  if (!id || !validId(id)) {
    throw httpError(400, `A valid ${label} is required.`);
  }
}

function requireUserId(user) {
  const id = getUserId(user);
  requireId(id, "user ID");
  return id;
}

function sameId(a, b) {
  return Boolean(a && b && String(a) === String(b));
}

function isOwner(user) {
  return user.role === "owner";
}

async function getAuthorizedParty(partyId, user) {
  requireId(partyId, "party ID");

  const party = await Party.findOne({
    _id: partyId,
    isActive: true,
  });

  if (!party) {
    throw httpError(404, "Party not found or inactive.");
  }

  if (user.role === "owner") return party;

  if (user.role === "salesman") {
    if (!sameId(party.assignedSalesmanId, getUserId(user))) {
      throw httpError(403, "This party is not assigned to you.");
    }
    return party;
  }

  if (user.role === "customer") {
    if (!sameId(user.partyId, party._id)) {
      throw httpError(403, "You can only order for your own party.");
    }
    return party;
  }

  throw httpError(403, "You are not allowed to place orders.");
}

async function buildItems(inputItems) {
  if (!Array.isArray(inputItems) || inputItems.length === 0) {
    throw httpError(400, "An order must contain at least one item.");
  }

  if (inputItems.length > 100) {
    throw httpError(400, "An order cannot contain more than 100 items.");
  }

  const items = [];

  for (const input of inputItems) {
    requireId(input.productId, "product ID");

    const quantity = Number(input.quantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw httpError(400, "Every item must have a quantity greater than zero.");
    }

    const product = await Product.findOne({
      _id: input.productId,
      isActive: true,
    });

    if (!product) {
      throw httpError(400, `Product ${input.productId} was not found or is inactive.`);
    }

    // Unit comes from the database. Reject a mismatching client unit.
    if (input.unit && input.unit.trim() !== product.unit) {
      throw httpError(
        400,
        `The unit for "${product.name}" must be "${product.unit}".`
      );
    }

    const item = {
      productId: product._id,
      productNameSnapshot: product.name,
      quantity,
      unit: product.unit,
    };

    // Do not convert an unavailable/quote price into zero.
    if (
      product.pricingMode === "fixed" &&
      Number.isFinite(product.optionalPrice) &&
      product.optionalPrice >= 0
    ) {
      item.optionalUnitPrice = product.optionalPrice;
      item.optionalLineTotal = Number(
        (quantity * product.optionalPrice).toFixed(2)
      );
    }

    items.push(item);
  }

  return items;
}

async function getOrderForUser(orderId, user) {
  requireId(orderId, "order ID");

  const order = await Order.findById(orderId)
    .populate("partyId", "partyCode name phone address assignedSalesmanId")
    .populate("createdBy", "name loginIdentifier role")
    .populate("confirmedBy", "name role")
    .populate("cancelledBy", "name role");

  if (!order) {
    throw httpError(404, "Order not found.");
  }

  if (isOwner(user)) return order;

  const party = order.partyId;

  if (user.role === "customer") {
    if (sameId(user.partyId, party?._id)) return order;
    throw httpError(403, "You cannot access this order.");
  }

  if (user.role === "salesman") {
    const assignedToSalesman = sameId(
      party?.assignedSalesmanId,
      getUserId(user)
    );
    const createdBySalesman = sameId(order.createdBy?._id, getUserId(user));

    if (assignedToSalesman || createdBySalesman) return order;
    throw httpError(403, "You cannot access this order.");
  }

  throw httpError(403, "You cannot access orders.");
}

export async function createOrder(input, user) {
if (!["salesman", "customer"].includes(user.role)) {
  throw httpError(403, "Only customers and salesmen can create orders.");
}

  const createdBy = requireUserId(user);
  const party = await getAuthorizedParty(input.partyId, user);
  const items = await buildItems(input.items);

  const order = await Order.create({
    partyId: party._id,
    source: user.role === "customer" ? "customer" : "salesman",
    createdBy,
    items,
    notes: typeof input.notes === "string" ? input.notes.trim() : "",
    status: "pending",
  });

  return Order.findById(order._id)
    .populate("partyId", "partyCode name phone address")
    .populate("createdBy", "name loginIdentifier role");
}

export async function listOrders(query, user) {
  const filter = {};

  if (query.status) {
    const allowedStatuses = [
      "pending",
      "confirmed",
      "cancelled",
      "dispatched",
      "delivered",
    ];

    if (!allowedStatuses.includes(query.status)) {
      throw httpError(400, "Invalid order status filter.");
    }

    filter.status = query.status;
  }

  if (query.partyId) {
    requireId(query.partyId, "party ID");
    filter.partyId = query.partyId;
  }

  if (query.salesmanId) {
    requireId(query.salesmanId, "salesman ID");
    filter.createdBy = query.salesmanId;
  }

  if (query.startDate || query.endDate) {
    filter.createdAt = {};

    if (query.startDate) {
      const start = new Date(query.startDate);
      if (Number.isNaN(start.getTime())) {
        throw httpError(400, "Invalid startDate.");
      }
      start.setHours(0, 0, 0, 0);
      filter.createdAt.$gte = start;
    }

    if (query.endDate) {
      const end = new Date(query.endDate);
      if (Number.isNaN(end.getTime())) {
        throw httpError(400, "Invalid endDate.");
      }
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (user.role === "customer") {
    requireId(user.partyId, "customer party ID");
    filter.partyId = user.partyId;
  } else if (user.role === "salesman") {
    const assignedParties = await Party.find({
      assignedSalesmanId: getUserId(user),
    }).distinct("_id");

    filter.$or = [
      { createdBy: getUserId(user) },
      { partyId: { $in: assignedParties } },
    ];
  } else if (user.role !== "owner") {
    throw httpError(403, "You cannot list orders.");
  }

  const search = typeof query.search === "string"
    ? query.search.trim()
    : "";

  if (search) {
    const matchingParties = await Party.find({
      name: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" },
    }).distinct("_id");

    const searchFilter = {
      $or: [
        { orderNumber: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } },
        { partyId: { $in: matchingParties } },
      ],
    };

    // Preserve the role/date/status filters while adding search.
    filter.$and = [...(filter.$and ?? []), searchFilter];
  }

  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("partyId", "partyCode name phone")
      .populate("createdBy", "name loginIdentifier role")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  return {
    orders,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function getOrder(orderId, user) {
  return getOrderForUser(orderId, user);
}

export async function updatePendingOrder(orderId, input, user) {
  const order = await Order.findById(orderId);

  if (!order) throw httpError(404, "Order not found.");

  if (order.status !== "pending") {
    throw httpError(
      409,
      "Only pending orders can be edited directly. Request an amendment for a confirmed or dispatched order."
    );
  }

  const isCreator = sameId(order.createdBy, getUserId(user));

  if (!isOwner(user) && !isCreator) {
    throw httpError(403, "You can only edit your own pending orders.");
  }

  // Re-check party access for non-owners.
  await getAuthorizedParty(order.partyId, user);

  if (input.items !== undefined) {
    order.items = await buildItems(input.items);
  }

  if (input.notes !== undefined) {
    if (typeof input.notes !== "string") {
      throw httpError(400, "Notes must be text.");
    }
    order.notes = input.notes.trim();
  }

  await order.save();

  return getOrderForUser(order._id, user);
}

export async function confirmOrder(orderId, user) {
  if (!isOwner(user)) {
    throw httpError(403, "Only the owner can confirm orders.");
  }

  const order = await Order.findById(orderId);

  if (!order) throw httpError(404, "Order not found.");
  if (order.status !== "pending") {
    throw httpError(409, "Only pending orders can be confirmed.");
  }

  order.status = "confirmed";
  order.confirmedBy = requireUserId(user);
  order.confirmedAt = new Date();

  await order.save();
  return order;
}

export async function cancelOrder(orderId, input, user) {
  if (!isOwner(user)) {
    throw httpError(403, "Only the owner can cancel orders.");
  }

  const order = await Order.findById(orderId);

  if (!order) throw httpError(404, "Order not found.");

  if (!["pending", "confirmed"].includes(order.status)) {
    throw httpError(409, "This order can no longer be cancelled directly.");
  }

  if (order.challanId) {
    throw httpError(409, "Remove this order from its challan before cancelling it.");
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    throw httpError(400, "A cancellation reason is required.");
  }

  order.status = "cancelled";
  order.cancelledBy = requireUserId(user);
  order.cancelledAt = new Date();
  order.cancellationReason = reason;

  await order.save();
  return order;
}

export async function requestAmendment(orderId, input, user) {
  const order = await getOrderForUser(orderId, user);

  if (!["confirmed", "dispatched"].includes(order.status)) {
    throw httpError(
      409,
      "Amendments can only be requested for confirmed or dispatched orders."
    );
  }

  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) {
    throw httpError(400, "An amendment reason is required.");
  }

  const amendment = {
    requestedBy: requireUserId(user),
    requestedAt: new Date(),
    reason,
    status: "pending",
  };

  if (input.items !== undefined) {
    amendment.proposedItems = await buildItems(input.items);
  }

  if (input.notes !== undefined) {
    if (typeof input.notes !== "string") {
      throw httpError(400, "Proposed notes must be text.");
    }
    amendment.proposedNotes = input.notes.trim();
  }

  if (
    amendment.proposedItems === undefined &&
    amendment.proposedNotes === undefined
  ) {
    throw httpError(400, "Provide proposed items or proposed notes.");
  }

  order.amendments.push(amendment);
  await order.save();

  return order;
}
