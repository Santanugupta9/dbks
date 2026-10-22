
import mongoose from "mongoose";
import { randomBytes } from "node:crypto";

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productNameSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.000001, "Quantity must be greater than zero"],
    },
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    // These fields are omitted when a price is not available.
    optionalUnitPrice: {
      type: Number,
      min: [0, "Unit price cannot be negative"],
    },
    optionalLineTotal: {
      type: Number,
      min: [0, "Line total cannot be negative"],
    },
  },
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      index: true,
    },

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      required: true,
      index: true,
    },

    source: {
      type: String,
      enum: ["customer", "salesman"],
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "An order must contain at least one product",
      },
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "cancelled",
        "dispatched",
        "delivered",
      ],
      default: "pending",
      required: true,
      index: true,
    },

    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    confirmedAt: Date,

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancelledAt: Date,
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    challanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryChallan",
      default: null,
      index: true,
    },

amendments: [
  {
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    proposedItems: {
      type: [orderItemSchema],
    },
    proposedNotes: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
  },
],

  },
  {
    timestamps: true,
  }
  
);

// Generate an order number on the server, not in the browser.
orderSchema.pre("validate", function () {
  if (!this.orderNumber) {
    const date = new Date()
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");

    const suffix = randomBytes(4).toString("hex").toUpperCase();

    this.orderNumber = `ORD-${date}-${suffix}`;
  }
});

const Order = mongoose.model("Order", orderSchema);

export default Order;
