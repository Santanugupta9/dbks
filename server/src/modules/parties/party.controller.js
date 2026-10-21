import mongoose from "mongoose";
import Party from "./party.model.js";
import User from "../users/user.model.js";

function normalizeParty(body) {
  const errors = [];

  const data = {
    partyCode: String(body.partyCode || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    contactPerson: String(body.contactPerson || "").trim(),
    phone: String(body.phone || "").trim(),
    address: String(body.address || "").trim(),
    assignedSalesmanId: body.assignedSalesmanId || null,
  };

  if (!data.partyCode) errors.push("Party code is required.");
  if (!data.name) errors.push("Party name is required.");
  if (!data.phone) errors.push("Phone is required.");
  if (!data.address) errors.push("Address is required.");

  if (
    data.assignedSalesmanId &&
    !mongoose.isValidObjectId(data.assignedSalesmanId)
  ) {
    errors.push("Invalid salesman ID.");
  }

  if (body.location) {
    const latitude = Number(body.location.latitude);
    const longitude = Number(body.location.longitude);

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      errors.push("Invalid latitude or longitude.");
    } else {
      data.location = { latitude, longitude };
    }
  }

  return { data, errors };
}

async function validateSalesman(salesmanId) {
  if (!salesmanId) return null;

  const salesman = await User.findOne({
    _id: salesmanId,
    role: "salesman",
    isActive: true,
  });

  if (!salesman) {
    const error = new Error("Assigned salesman is not an active salesman.");
    error.status = 400;
    throw error;
  }

  return salesman._id;
}

function partyFilter(req) {
  const filter = {};

  if (req.user.role === "salesman") {
    filter.assignedSalesmanId = req.user.id;
  }

  if (req.query.search) {
    const search = String(req.query.search)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { partyCode: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  if (req.query.active === "true") filter.isActive = true;
  if (req.query.active === "false") filter.isActive = false;

  return filter;
}

export async function listParties(req, res, next) {
  try {
    const filter = partyFilter(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const [parties, total] = await Promise.all([
      Party.find(filter)
        .populate("assignedSalesmanId", "name loginIdentifier")
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Party.countDocuments(filter),
    ]);

    res.json({
      parties,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getParty(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid party ID." });
    }

    const filter = { _id: req.params.id };

    if (req.user.role === "salesman") {
      filter.assignedSalesmanId = req.user.id;
    }

    const party = await Party.findOne(filter)
      .populate("assignedSalesmanId", "name loginIdentifier");

    if (!party) {
      return res.status(404).json({ message: "Party not found." });
    }

    res.json({ party });
  } catch (error) {
    next(error);
  }
}

export async function createParty(req, res, next) {
  try {
    const { data, errors } = normalizeParty(req.body);

    if (errors.length) {
      return res.status(400).json({ message: "Invalid party.", errors });
    }

    data.assignedSalesmanId = await validateSalesman(
      data.assignedSalesmanId
    );

    const party = await Party.create({
      ...data,
      createdBy: req.user.id,
    });

    res.status(201).json({ party });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Party code already exists." });
    }
    next(error);
  }
}

export async function updateParty(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid party ID." });
    }

    const { data, errors } = normalizeParty(req.body);

    if (errors.length) {
      return res.status(400).json({ message: "Invalid party.", errors });
    }

    data.assignedSalesmanId = await validateSalesman(
      data.assignedSalesmanId
    );

    const party = await Party.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!party) {
      return res.status(404).json({ message: "Party not found." });
    }

    res.json({ party });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "Party code already exists." });
    }
    next(error);
  }
}