const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    // Password is optional — social-auth users won't have one
    password: { type: String },
    profileImage: {
      type: String,
      default: "",
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    // Email verification
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerificationExpire: Date,
    // Social auth provider IDs
    googleId: { type: String, sparse: true },
    facebookId: { type: String, sparse: true },
    twitterId: { type: String, sparse: true },
    // Which method was used to create the account
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook", "twitter"],
      default: "local",
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
);

// Hash password before saving (skip if no password — social auth users)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Check entered password vs hashed (returns false if user has no password)
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate password reset token
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash and store in DB
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Set expiry — 30 minutes
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000;

  // Return the un-hashed token (sent via email)
  return resetToken;
};

// Generate email verification token
userSchema.methods.getEmailVerificationToken = function () {
  const verifyToken = crypto.randomBytes(20).toString("hex");

  // Hash and store in DB
  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(verifyToken)
    .digest("hex");

  // Set expiry — 24 hours
  this.emailVerificationExpire = Date.now() + 24 * 60 * 60 * 1000;

  // Return the un-hashed token (sent via email)
  return verifyToken;
};

module.exports = mongoose.model("User", userSchema);
