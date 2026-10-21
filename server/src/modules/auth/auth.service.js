import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../users/user.model.js";
import { env } from "../../config/env.js";

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

refreshSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const RefreshSession =
  mongoose.models.RefreshSession ||
  mongoose.model("RefreshSession", refreshSessionSchema);

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

function createAccessToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), role: user.role },
    env.accessSecret,
    {
      algorithm: "HS256",
      expiresIn: env.accessTtl,
    }
  );
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    loginIdentifier: user.loginIdentifier,
    identifierType: user.identifierType,
    role: user.role,
    isActive: user.isActive,
  };
}

export async function loginUser(identifier, password) {
  const normalized = String(identifier || "").trim().toLowerCase();

  if (!normalized || typeof password !== "string" || !password) {
    const error = new Error("Login identifier and password are required.");
    error.status = 400;
    throw error;
  }

  const user = await User.findOne({
    loginIdentifier: normalized,
  }).select("+passwordHash");

  // Use the same error message for an unknown user and a wrong password.
  if (
    !user ||
    !(await bcrypt.compare(password, user.passwordHash))
  ) {
    const error = new Error("Invalid login identifier or password.");
    error.status = 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error("This account is inactive.");
    error.status = 403;
    throw error;
  }

  const refreshToken = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + env.refreshDays * 24 * 60 * 60 * 1000
  );

  await RefreshSession.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return {
    accessToken: createAccessToken(user),
    refreshToken,
    user: publicUser(user),
  };
}

export async function refreshUserSession(token) {
  if (!token || typeof token !== "string") {
    const error = new Error("Refresh session is required.");
    error.status = 401;
    throw error;
  }

  const oldHash = hashToken(token);
  const replacement = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + env.refreshDays * 24 * 60 * 60 * 1000
  );

  // Atomically consume the old session so concurrent refreshes cannot
  // both successfully rotate the same token.
  const session = await RefreshSession.findOneAndUpdate(
    {
      tokenHash: oldHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date() } },
    { new: false }
  );

  if (!session) {
    const error = new Error("Refresh session is invalid or expired.");
    error.status = 401;
    throw error;
  }

  const user = await User.findById(session.userId);

  if (!user || !user.isActive) {
    const error = new Error("Account is unavailable.");
    error.status = 401;
    throw error;
  }

  try {
    await RefreshSession.create({
      userId: user._id,
      tokenHash: hashToken(replacement),
      expiresAt,
    });
  } catch (error) {
    // Do not restore the old token if session creation fails.
    throw error;
  }

  return {
    accessToken: createAccessToken(user),
    refreshToken: replacement,
    user: publicUser(user),
  };
}

export async function logoutUser(token) {
  if (!token || typeof token !== "string") return;

  await RefreshSession.updateOne(
    {
      tokenHash: hashToken(token),
      revokedAt: null,
    },
    { $set: { revokedAt: new Date() } }
  );
}

export { publicUser };