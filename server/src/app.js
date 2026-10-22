import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";

import authRoutes from "./modules/auth/auth.routes.js";
import productRoutes from "./modules/products/product.routes.js";
import partyRoutes from "./modules/parties/party.routes.js";
import importRoutes from "./modules/imports/import.routes.js";

import {
  notFound,
  errorHandler,
} from "./middleware/errorHandler.js";

const app = express();

app.disable("x-powered-by");

app.use(cors({
  origin: env.clientUrl,
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "distribution-management-api",
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/parties", partyRoutes);
app.use("/api/v1/imports", importRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;