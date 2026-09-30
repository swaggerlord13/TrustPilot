const mongoose = require("mongoose");

/**
 * CompanyClaim — links a user to a company they claim to represent.
 *
 * Flow:
 *   1. User signs up normally (or already has an account)
 *   2. User searches for their company and clicks "Claim This Company"
 *   3. A CompanyClaim record is created with status: "pending"
 *   4. Admin reviews and approves or rejects from the /add panel
 *   5. Once approved, user can access the company dashboard
 */
const companyClaimSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "manager", "representative"],
      default: "owner",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    // Why they're claiming (helps admin decide)
    reason: {
      type: String,
      maxLength: 500,
      default: "",
    },
    // Job title at the company
    jobTitle: {
      type: String,
      maxLength: 100,
      default: "",
    },
    // Admin notes (for approve/reject reason)
    adminNotes: {
      type: String,
      maxLength: 500,
      default: "",
    },
    approvedAt: { type: Date },
    rejectedAt: { type: Date },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// One active claim per user per company
companyClaimSchema.index(
  { user: 1, company: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "approved"] } },
  }
);

// Quick lookup: all claims for a company
companyClaimSchema.index({ company: 1, status: 1 });

// Quick lookup: all claims by a user
companyClaimSchema.index({ user: 1, status: 1 });

// Admin view: pending claims
companyClaimSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("CompanyClaim", companyClaimSchema);
