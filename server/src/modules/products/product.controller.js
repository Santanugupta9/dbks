import mongoose from "mongoose";
import Product from "./product.model.js";
import Category from "./category.model.js";

const isValidId = (id) => mongoose.isValidObjectId(id);

function validateProductInput(body) {
  const errors = [];
  const name = String(body.name || "").trim();
  const sku = String(body.sku || "").trim().toUpperCase();
  const unit = String(body.unit || "").trim();
  const pricingMode = body.pricingMode || "quote";
  const price = body.optionalPrice;

  if (!name) errors.push("Product name is required.");
  if (!sku) errors.push("SKU is required.");
  if (!unit) errors.push("Unit is required.");

  if (!["fixed", "quote"].includes(pricingMode)) {
    errors.push("pricingMode must be fixed or quote.");
  }

  if (
    pricingMode === "fixed" &&
    (price === "" || price == null || !Number.isFinite(Number(price)) ||
      Number(price) < 0)
  ) {
    errors.push("A valid non-negative price is required.");
  }

  if (body.category && !isValidId(body.category)) {
    errors.push("Invalid category ID.");
  }

  return {
    errors,
    data: {
      name,
      sku,
      unit,
      pricingMode,
      optionalPrice:
        pricingMode === "fixed" ? Number(price) : null,
      description: String(body.description || "").trim(),
      image: String(body.image || "").trim(),
      category: body.category || null,
    },
  };
}

export async function listProducts(req, res, next) {
  try {
    const filter = {};

    // Public and customer-facing requests only see active products.
    if (!req.user || req.user.role === "customer") {
      filter.isActive = true;
    }

    if (req.query.category && isValidId(req.query.category)) {
      filter.category = req.query.category;
    }

    if (req.query.search) {
      const escaped = String(req.query.search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { sku: { $regex: escaped, $options: "i" } },
      ];
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("category", "name slug")
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    // Quote-mode products never disclose a price.
    const safeProducts = products.map((product) => ({
      ...product,
      optionalPrice:
        product.pricingMode === "fixed" ? product.optionalPrice : null,
    }));

    res.json({
      products: safeProducts,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getProduct(req, res, next) {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category", "name slug")
      .lean();

    if (!product || ((!req.user || req.user.role === "customer") && !product.isActive)) {
      return res.status(404).json({ message: "Product not found." });
    }

    if (product.pricingMode === "quote") product.optionalPrice = null;

    res.json({ product });
  } catch (error) {
    next(error);
  }
}

export async function createProduct(req, res, next) {
  try {
    const { errors, data } = validateProductInput(req.body);

    if (errors.length) {
      return res.status(400).json({ message: "Invalid product.", errors });
    }

    if (data.category) {
      const category = await Category.findById(data.category);
      if (!category || !category.isActive) {
        return res.status(400).json({ message: "Category is unavailable." });
      }
    }

    const product = await Product.create({
      ...data,
      createdBy: req.user.id,
    });

    res.status(201).json({ product });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That SKU already exists." });
    }
    next(error);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const { errors, data } = validateProductInput(req.body);

    if (errors.length) {
      return res.status(400).json({ message: "Invalid product.", errors });
    }

    if (data.category) {
      const category = await Category.findById(data.category);
      if (!category || !category.isActive) {
        return res.status(400).json({ message: "Category is unavailable." });
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.json({ product });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "That SKU already exists." });
    }
    next(error);
  }
}

export async function listCategories(req, res, next) {
  try {
    const categories = await Category.find({ isActive: true })
      .sort({ name: 1 })
      .lean();

    res.json({ categories });
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({ message: "Category name is required." });
    }

    const slug = name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) {
      return res.status(400).json({
        message: "Use a category name containing letters or numbers.",
      });
    }

    const category = await Category.create({ name, slug });

    res.status(201).json({ category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A category with that name already exists.",
      });
    }
    next(error);
  }
}