/**
 * Makes a user an admin by email
 * Run: node scripts/makeAdmin.js your@email.com
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");

const email = process.argv[2];

if (!email) {
  console.log("Usage: node scripts/makeAdmin.js <email>");
  process.exit(1);
}

async function promote() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Any capitalisation of the email
    const user = await User.findByEmail(email);
    if (!user) {
      console.log(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    user.isAdmin = true;
    await user.save({ validateBeforeSave: false });
    console.log(`✅ ${user.name} (${user.email}) is now an admin!`);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

promote();
