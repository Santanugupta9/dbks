import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import User from "../src/modules/users/user.model.js";

async function main() {
  const name = process.env.OWNER_NAME?.trim();
  const login = process.env.OWNER_LOGIN?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;

  if (!name || !login || !password) {
    throw new Error(
      "Set OWNER_NAME, OWNER_LOGIN, and OWNER_PASSWORD before running."
    );
  }

  if (password.length < 12) {
    throw new Error("Owner password must contain at least 12 characters.");
  }

  const identifierType = login.includes("@") ? "email" : "phone";

  if (identifierType === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) {
    throw new Error("Invalid owner email address.");
  }

  if (
    identifierType === "phone" &&
    !/^\+?[0-9]{7,15}$/.test(login.replace(/[\s()-]/g, ""))
  ) {
    throw new Error("Use a phone number with country code, if applicable.");
  }

  await connectDatabase();

  const existingOwner = await User.findOne({ role: "owner" });

  if (existingOwner) {
    throw new Error("An owner account already exists.");
  }

  const existingUser = await User.findOne({ loginIdentifier: login });

  if (existingUser) {
    throw new Error("That login identifier is already registered.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await User.create({
    name,
    loginIdentifier: login,
    identifierType,
    passwordHash,
    role: "owner",
    isActive: true,
  });

  console.log("Owner account created successfully.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });