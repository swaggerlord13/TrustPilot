const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Display name
    email: { type: String, required: true, unique: true }, // For login
    password: { type: String, required: true }, // Hashed password
    profileImage: {
      type: String, // URL or file path
      default: "https://via.placeholder.com/100",
    },
  },
  { timestamps: true }
);

// Hash password before saving user
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next(); // Only hash if new/changed
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method to check entered password vs hashed one
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
