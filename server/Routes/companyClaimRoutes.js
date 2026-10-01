const express = require("express");
const CompanyClaim = require("../models/CompanyClaim");
const Company = require("../models/Company");
// requireVerified: only verified emails may claim a business
const { protect, requireVerified } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
// Logs unexpected errors and answers without leaking internal details
const { sendServerError } = require("../utils/http");
const router = express.Router();

/**
 * @route   POST /api/company-claims
 * @desc    Claim a company (user must be logged in)
 * @body    { companyId, role?, reason?, jobTitle? }
 */
router.post("/", protect, requireVerified, async (req, res) => {
  try {
    const { companyId, role, reason, jobTitle } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    // Check company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Check if user already has a pending or approved claim for this company
    const existingClaim = await CompanyClaim.findOne({
      user: req.user._id,
      company: companyId,
      status: { $in: ["pending", "approved"] },
    });

    if (existingClaim) {
      if (existingClaim.status === "approved") {
        return res.status(400).json({ error: "You already manage this company" });
      }
      return res.status(400).json({ error: "You already have a pending claim for this company" });
    }

    const claim = await CompanyClaim.create({
      user: req.user._id,
      company: companyId,
      role: role || "owner",
      reason: reason || "",
      jobTitle: jobTitle || "",
    });

    res.status(201).json({
      message: "Claim submitted! An admin will review it shortly.",
      claim: {
        _id: claim._id,
        company: company.name,
        status: claim.status,
        createdAt: claim.createdAt,
      },
    });
  } catch (err) {
    // Handle duplicate key error (unique index)
    if (err.code === 11000) {
      return res.status(400).json({ error: "You already have an active claim for this company" });
    }
    console.error("Claim error:", err);
    sendServerError(res, err);
  }
});

/**
 * @route   GET /api/company-claims/my-claims
 * @desc    Get all claims by the logged-in user
 */
router.get("/my-claims", protect, async (req, res) => {
  try {
    const claims = await CompanyClaim.find({ user: req.user._id })
      .populate("company", "name slug logo url")
      .sort({ createdAt: -1 });

    res.json(claims);
  } catch (err) {
    sendServerError(res, err);
  }
});

/**
 * @route   GET /api/company-claims/my-companies
 * @desc    Get companies the user has approved claims for (their dashboard list)
 */
router.get("/my-companies", protect, async (req, res) => {
  try {
    const approvedClaims = await CompanyClaim.find({
      user: req.user._id,
      status: "approved",
    }).populate("company", "name slug logo url description category");

    // Skip claims whose company was deleted (older data from before deletes cleaned up)
    const companies = approvedClaims.filter((claim) => claim.company).map((claim) => ({
      _id: claim.company._id,
      name: claim.company.name,
      slug: claim.company.slug,
      logo: claim.company.logo,
      url: claim.company.url,
      description: claim.company.description,
      role: claim.role,
      claimedAt: claim.createdAt,
      approvedAt: claim.approvedAt,
    }));

    res.json(companies);
  } catch (err) {
    sendServerError(res, err);
  }
});

/**
 * @route   GET /api/company-claims/pending
 * @desc    Admin: get all pending claims
 */
router.get("/pending", protect, admin, async (req, res) => {
  try {

    const pendingClaims = await CompanyClaim.find({ status: "pending" })
      .populate("user", "name email profileImage")
      .populate("company", "name slug logo url")
      .sort({ createdAt: -1 });

    res.json({ claims: pendingClaims });
  } catch (err) {
    sendServerError(res, err);
  }
});

/**
 * @route   PUT /api/company-claims/:id/approve
 * @desc    Admin: approve a claim
 */
router.put("/:id/approve", protect, admin, async (req, res) => {
  try {

    const claim = await CompanyClaim.findById(req.params.id)
      .populate("user", "name email isEmailVerified")
      .populate("company", "name slug");

    if (!claim) {
      return res.status(404).json({ error: "Claim not found" });
    }

    if (claim.status !== "pending") {
      return res.status(400).json({ error: `Claim is already ${claim.status}` });
    }

    // The account or company was deleted after the claim was made
    if (!claim.user || !claim.company) {
      return res.status(400).json({ error: "The user or company for this claim no longer exists" });
    }

    // Business sign-up creates a claim before the email is verified; only a
    // verified owner may get dashboard access
    if (!claim.user.isEmailVerified) {
      return res.status(400).json({ error: "This user hasn't verified their email yet. Ask them to click the link in their inbox, then approve." });
    }

    claim.status = "approved";
    claim.approvedAt = new Date();
    claim.approvedBy = req.user._id;
    claim.adminNotes = req.body.notes || "";
    await claim.save();

    res.json({
      message: `${claim.user.name} approved as ${claim.role} of ${claim.company.name}`,
      claim,
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

/**
 * @route   PUT /api/company-claims/:id/reject
 * @desc    Admin: reject a claim
 */
router.put("/:id/reject", protect, admin, async (req, res) => {
  try {

    const claim = await CompanyClaim.findById(req.params.id)
      .populate("user", "name email")
      .populate("company", "name slug");

    if (!claim) {
      return res.status(404).json({ error: "Claim not found" });
    }

    if (claim.status !== "pending") {
      return res.status(400).json({ error: `Claim is already ${claim.status}` });
    }

    claim.status = "rejected";
    claim.rejectedAt = new Date();
    claim.adminNotes = req.body.notes || "";
    await claim.save();

    res.json({
      message: `Claim by ${claim.user.name} for ${claim.company.name} rejected`,
      claim,
    });
  } catch (err) {
    sendServerError(res, err);
  }
});

module.exports = router;
