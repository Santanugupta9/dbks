import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import mongoose from "mongoose";

import ImportJob from "./import.model.js";
import Product from "../products/product.model.js";
import Party from "../parties/party.model.js";
import Category from "../products/category.model.js";
import User from "../users/user.model.js";

const MAX_ROWS = 5000;
const PREVIEW_TTL_MS = 30 * 60 * 1000;

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function headerKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

async function parseSpreadsheet(file) {
  const filename = file.originalname.toLowerCase();

  if (filename.endsWith(".csv")) {
    const records = parseCsv(file.buffer.toString("utf8"), {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: true,
    });

    if (!records.length) return [];

    const headers = records[0].map(headerKey);

    return records.slice(1).map((values, index) => {
      const row = { _rowNumber: index + 2 };

      headers.forEach((header, column) => {
        if (header) row[header] = clean(values[column]);
      });

      return row;
    });
  }

  if (filename.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);

    const sheet = workbook.worksheets[0];

    if (!sheet) {
      throw Object.assign(new Error("Workbook has no worksheet."), {
        status: 400,
      });
    }

    const headerRow = sheet.getRow(1);
    const headers = [];

    headerRow.eachCell({ includeEmpty: true }, (cell, column) => {
      headers[column] = headerKey(cell.text);
    });

    const rows = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const item = { _rowNumber: rowNumber };

      headers.forEach((header, column) => {
        if (header) {
          item[header] = clean(row.getCell(column).text);
        }
      });

      if (Object.keys(item).some((key) => key !== "_rowNumber" && item[key])) {
        rows.push(item);
      }
    });

    return rows;
  }

  throw Object.assign(
    new Error("Only .xlsx and .csv files are supported."),
    { status: 400 }
  );
}

function validateRows(entityType, rows) {
  const errors = [];
  const seen = new Set();

  const normalized = rows.map((row) => {
    const rowNumber = row._rowNumber;
    let item;

    if (entityType === "products") {
      const pricingMode = clean(row.pricingmode) || "quote";
      const rawPrice = clean(row.optionalprice ?? row.price);
      const price = rawPrice === "" ? null : Number(rawPrice);

      item = {
        rowNumber,
        name: clean(row.name),
        sku: clean(row.sku).toUpperCase(),
        unit: clean(row.unit) || "piece",
        categoryName: clean(row.category),
        description: clean(row.description),
        image: clean(row.image),
        pricingMode,
        optionalPrice: pricingMode === "fixed" ? price : null,
      };

      if (!item.name) errors.push({ rowNumber, field: "name", message: "Name is required." });
      if (!item.sku) errors.push({ rowNumber, field: "sku", message: "SKU is required." });
      if (!["fixed", "quote"].includes(pricingMode)) {
        errors.push({ rowNumber, field: "pricingMode", message: "Use fixed or quote." });
      }

      if (
        pricingMode === "fixed" &&
        (!Number.isFinite(price) || price < 0)
      ) {
        errors.push({ rowNumber, field: "optionalPrice", message: "Fixed pricing requires a non-negative price." });
      }

      const key = item.sku;
      if (key && seen.has(key)) {
        errors.push({ rowNumber, field: "sku", message: "Duplicate SKU within file." });
      }
      if (key) seen.add(key);
    } else {
      item = {
        rowNumber,
        partyCode: clean(row.partycode).toUpperCase(),
        name: clean(row.name),
        contactPerson: clean(row.contactperson),
        phone: clean(row.phone),
        address: clean(row.address),
        salesmanIdentifier: clean(row.assignedsalesman || row.salesman).toLowerCase(),
      };

      if (!item.partyCode) errors.push({ rowNumber, field: "partyCode", message: "Party code is required." });
      if (!item.name) errors.push({ rowNumber, field: "name", message: "Name is required." });
      if (!item.phone) errors.push({ rowNumber, field: "phone", message: "Phone is required." });
      if (!item.address) errors.push({ rowNumber, field: "address", message: "Address is required." });

      const key = item.partyCode;
      if (key && seen.has(key)) {
        errors.push({ rowNumber, field: "partyCode", message: "Duplicate party code within file." });
      }
      if (key) seen.add(key);
    }

    return item;
  });

  return { normalized, errors };
}

export async function createImportPreview({ file, entityType, userId }) {
  if (!["products", "parties"].includes(entityType)) {
    throw Object.assign(new Error("Invalid import type."), { status: 400 });
  }

  const rows = await parseSpreadsheet(file);

  if (rows.length > MAX_ROWS) {
    throw Object.assign(
      new Error(`Maximum ${MAX_ROWS} data rows per import.`),
      { status: 400 }
    );
  }

  const { normalized, errors } = validateRows(entityType, rows);

  // Also check for records that already exist in the database.
  if (entityType === "products") {
    const skus = normalized.map((row) => row.sku).filter(Boolean);
    const existing = await Product.find({ sku: { $in: skus } })
      .select("sku")
      .lean();
    const existingSet = new Set(existing.map((item) => item.sku));

    normalized.forEach((row) => {
      if (row.sku && existingSet.has(row.sku)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: "sku",
          message: "SKU already exists in the database.",
        });
      }
    });
  } else {
    const codes = normalized.map((row) => row.partyCode).filter(Boolean);
    const existing = await Party.find({ partyCode: { $in: codes } })
      .select("partyCode")
      .lean();
    const existingSet = new Set(existing.map((item) => item.partyCode));

    normalized.forEach((row) => {
      if (row.partyCode && existingSet.has(row.partyCode)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: "partyCode",
          message: "Party code already exists in the database.",
        });
      }
    });
  }

  // Do not allow confirmation while any row-level errors remain.
  const job = await ImportJob.create({
    entityType,
    fileName: file.originalname,
    rows: normalized,
    errors,
    status: "previewed",
    createdBy: userId,
    expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
  });

  return {
    importId: job._id,
    entityType,
    fileName: job.fileName,
    totalRows: normalized.length,
    validRows: Math.max(0, normalized.length - new Set(errors.map((e) => e.rowNumber)).size),
    errors,
    preview: normalized.slice(0, 100),
    canCommit: errors.length === 0 && normalized.length > 0,
  };
}

export async function commitImport({ importId, userId }) {
  if (!mongoose.isValidObjectId(importId)) {
    throw Object.assign(new Error("Invalid import ID."), { status: 400 });
  }

  const job = await ImportJob.findOne({
    _id: importId,
    createdBy: userId,
    status: "previewed",
    expiresAt: { $gt: new Date() },
  });

  if (!job) {
    throw Object.assign(
      new Error("Import preview not found, expired, or already committed."),
      { status: 404 }
    );
  }

  if (job.errors.length) {
    throw Object.assign(
      new Error("Fix the spreadsheet errors before confirming the import."),
      { status: 400 }
    );
  }

  let imported = 0;

  // Sequential processing gives useful row-level failure handling.
  // Unique database indexes still protect against concurrent imports.
  for (const row of job.rows) {
    try {
      if (job.entityType === "products") {
        let category = null;

        if (row.categoryName) {
          const slug = row.categoryName
            .normalize("NFKD")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");

          if (!slug) {
            throw new Error("Invalid category name.");
          }

          category = await Category.findOneAndUpdate(
            { slug },
            { $setOnInsert: { name: row.categoryName, slug } },
            { upsert: true, new: true, runValidators: true }
          );
        }

        await Product.create({
          name: row.name,
          sku: row.sku,
          unit: row.unit,
          category: category?._id || null,
          description: row.description,
          image: row.image,
          pricingMode: row.pricingMode,
          optionalPrice: row.optionalPrice,
          createdBy: userId,
        });
      } else {
        let assignedSalesmanId = null;

        if (row.salesmanIdentifier) {
          const salesman = await User.findOne({
            loginIdentifier: row.salesmanIdentifier,
            role: "salesman",
            isActive: true,
          });

          if (!salesman) {
            throw new Error("Assigned salesman was not found or is inactive.");
          }

          assignedSalesmanId = salesman._id;
        }

        await Party.create({
          partyCode: row.partyCode,
          name: row.name,
          contactPerson: row.contactPerson,
          phone: row.phone,
          address: row.address,
          assignedSalesmanId,
          createdBy: userId,
        });
      }

      imported += 1;
    } catch (error) {
      if (error.code === 11000) {
        job.errors.push({
          rowNumber: row.rowNumber,
          message: "Duplicate record detected during import.",
        });
      } else {
        job.errors.push({
          rowNumber: row.rowNumber,
          message: error.message || "Unable to import row.",
        });
      }
    }
  }

  job.status = job.errors.length ? "failed" : "committed";
  job.summary = {
    totalRows: job.rows.length,
    imported,
    failed: job.rows.length - imported,
  };

  await job.save();

  return {
    importId: job._id,
    status: job.status,
    ...job.summary,
    errors: job.errors,
  };
}