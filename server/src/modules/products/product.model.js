import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },

    description: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    image: {
      type: String,
      default: "",
    },

    unit: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
      default: "piece",
    },

    pricingMode: {
      type: String,
      enum: ["fixed", "quote"],
      default: "quote",
    },

    optionalPrice: {
      type: Number,
      min: 0,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

productSchema.pre("validate", function () {
  if (this.pricingMode === "fixed" && this.optionalPrice == null) {
    this.invalidate(
      "optionalPrice",
      "A fixed-price product requires a price."
    );
  }

  if (this.pricingMode === "quote") {
    this.optionalPrice = null;
  }
});

productSchema.index({ name: "text", sku: "text" });
productSchema.index({ isActive: 1, category: 1 });

export default mongoose.model("Product", productSchema);