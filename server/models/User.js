const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // Saved trimmed and lower-case, so "Femi@X.com" and "femi@x.com" are one account
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
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
    // New address waiting for its verification link to be clicked; the
    // current email keeps working until then (so a typo can't lock anyone out)
    pendingEmail: { type: String, trim: true, lowercase: true },
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
    // Bumped to sign the user out everywhere (see utils/token.js)
    tokenVersion: { type: Number, default: 0 },
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

// Case-insensitive comparison (strength 2 = letters only, ignore case)
const EMAIL_COLLATION = { locale: "en", strength: 2 };

/**
 * The account using this email, or null. Tries, in order:
 *   1. exactly as typed (fast, indexed). Mongoose would lower-case the value,
 *      so this reads the collection directly. It finds a person's own account
 *      even when an older account differs only in capital letters.
 *   2. lower-cased (fast, indexed): every account saved from now on.
 *   3. ignoring case (slower scan): older mixed-case accounts. Only runs when
 *      1 and 2 miss, and finds nothing new once scripts/normalizeEmails.js ran.
 * Pass `exceptId` to ignore one account (e.g. "is it used by someone else?").
 */
userSchema.statics.findByEmail = async function (email, exceptId) {
  const typed = String(email ?? "").trim();
  if (!typed) return null;
  const notThis = exceptId ? { _id: { $ne: new mongoose.Types.ObjectId(String(exceptId)) } } : {};
  // 1. As typed, straight from the collection, turned into a normal document
  const raw = await this.collection.findOne({ email: typed, ...notThis });
  if (raw) return this.hydrate(raw);
  // 2. Lower-case (the model lower-cases the filter itself)
  const lower = await this.findOne({ email: typed, ...notThis });
  if (lower) return lower;
  // 3. Any capitalisation
  return this.findOne({ email: typed, ...notThis }).collation(EMAIL_COLLATION);
};

module.exports = mongoose.model("User", userSchema);
