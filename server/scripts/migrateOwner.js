import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import User from "../src/modules/users/user.model.js";

async function main() {
  const login = process.env.OWNER_LOGIN?.trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD;

  if (!login || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)) {
    throw new Error("Set OWNER_LOGIN to a valid email address.");
  }

  if (!password || password.length < 12) {
    throw new Error("OWNER_PASSWORD must contain at least 12 characters.");
  }

  await connectDatabase();

  const owner = await User.collection.findOne({ role: "owner" });

  if (!owner) {
    throw new Error("No existing owner found. Nothing changed.");
  }

  const existing = await User.collection.findOne({
    loginIdentifier: login,
    _id: { $ne: owner._id },
  });

  if (existing) {
    throw new Error("That email belongs to another account. Nothing changed.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await User.collection.updateOne(
    { _id: owner._id, role: "owner" },
    {
      $set: {
        loginIdentifier: login,
        identifierType: "email",
        passwordHash,
        isActive: true,
      },
      $unset: { phone: "" },
    }
  );

  console.log("Existing owner migrated successfully.");
  console.log("Owner ID preserved:", owner._id.toString());
  console.log("Login email:", login);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
