import express from "express";
import cors from "cors";

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173"
}));

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "API is running" });
});

export default app;