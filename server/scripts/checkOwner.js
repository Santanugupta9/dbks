import mongoose from "mongoose";
import { connectDatabase } from "../src/config/database.js";
import User from "../src/modules/users/user.model.js";

async function main() {
  await connectDatabase();

  const owner = await User.findOne({ role: "owner" })
    .select("name loginIdentifier identifierType role isActive");

  if (!owner) {
    console.log("No owner account found in this database.");
    return;
  }

  console.log({
    name: owner.name,
    loginIdentifier: owner.loginIdentifier,
    identifierType: owner.identifierType,
    role: owner.role,
    isActive: owner.isActive,
    emailMatches: owner.loginIdentifier === "prince@gmail.com",
  });
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
