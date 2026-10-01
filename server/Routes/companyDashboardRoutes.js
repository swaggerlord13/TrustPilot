const express = require("express");
const mongoose = require("mongoose");
const CompanyClaim = require("../models/CompanyClaim");
const Company = require("../models/Company");
const Review = require("../models/Review");
const ReviewReply = require("../models/ReviewReply");
const { protect } = require("../middleware/authMiddleware");
// Safe http(s) links for website/logo
const { normalizeHttpUrl } = require("../utils/input");
// Logs unexpected errors and answers without leaking internal details
const { sendServerError } = require("../utils/http");
const router = express.Router();

/**
 * Middleware: check that the logged-in user has an approved claim
 * for the company in :companyId. Attaches req.claim and req.company.
 */
const requireCompanyAccess = async (req, res, next) => {
  try {
    const { companyId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ error: "Invalid company ID" });
    }

    const claim = await CompanyClaim.findOne({
      user: req.user._id,
      company: companyId,
      status: "approved",
    });

    // Also allow admins to access any company dashboard
    if (!claim && !req.user.isAdmin) {
      return res.status(403).json({
        error: "You don't have access to this company's dashboard",
      });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    req.claim = claim;
    req.company = company;
    next();
  } catch (err) {
    sendServerError(res, err);
  }
};

/**
 * @route   GET /api/company-dashboard/:companyId/stats
 * @desc    Get company dashboard statistics
 */
router.get("/:companyId/stats", protect, requireCompanyAccess, async (req, res) => {
  try {
    const companyId = req.company._id;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Use MongoDB aggregation instead of loading all reviews into memory
    const [stats] = await Review.aggregate([
      { $match: { company: companyId } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgRating: { $avg: "$rating" },
          stars1: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
          stars2: { $sum: { $cond: [{ $eq: ["$rating", 2] }, 1, 0] } },
          stars3: { $sum: { $cond: [{ $eq: ["$rating", 3] }, 1, 0] } },
          stars4: { $sum: { $cond: [{ $eq: ["$rating", 4] }, 1, 0] } },
          stars5: { $sum: { $cond: [{ $eq: ["$rating", 5] }, 1, 0] } },
          recentReviewCount: {
            $sum: { $cond: [{ $gte: ["$createdAt", thirtyDaysAgo] }, 1, 0] },
          },
        },
      },
    ]);

    if (!stats) {
      return res.json({
        totalReviews: 0,
        avgRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        recentReviewCount: 0,
        repliedCount: 0,
        replyRate: 0,
      });
    }

    // Count replies using a simple countDocuments (no need to load review IDs)
    const repliedCount = await ReviewReply.countDocuments({ company: companyId });
    const replyRate = Math.round((repliedCount / stats.totalReviews) * 100);

    res.json({
      totalReviews: stats.totalReviews,
      avgRating: Math.round(stats.avgRating * 10) / 10,
      ratingDistribution: {
        1: stats.stars1,
        2: stats.stars2,
        3: stats.stars3,
        4: stats.stars4,
        5: stats.stars5,
      },
      recentReviewCount: stats.recentReviewCount,
      repliedCount,
      replyRate,
    });
  } catch (err) {
    console.error("Stats error:", err);
    sendServerError(res, err);
  }
});

/**
 * @route   GET /api/company-dashboard/:companyId/reviews
 * @desc    Get all reviews for this company (with reply status)
 * @query   page, limit, sort (newest, oldest, highest, lowest)
 */
router.get("/:companyId/reviews", protect, requireCompanyAccess, async (req, res) => {
  try {
    const companyId = req.company._id;
    // Page >= 1 and 1..50 reviews per page
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    // Sort options
    let sortOption = { createdAt: -1 }; // default: newest first
    switch (req.query.sort) {
      case "oldest":
        sortOption = { createdAt: 1 };
        break;
      case "highest":
        sortOption = { rating: -1, createdAt: -1 };
        break;
      case "lowest":
        sortOption = { rating: 1, createdAt: -1 };
        break;
    }

    const [reviews, total] = await Promise.all([
      Review.find({ company: companyId })
        // Name and photo only: reviewers' email addresses stay private,
        // even from the business they reviewed
        .populate("user", "name profileImage")
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments({ company: companyId }),
    ]);

    // Get replies for these reviews in one query
    const reviewIds = reviews.map((r) => r._id);
    const replies = await ReviewReply.find({ review: { $in: reviewIds } })
      .populate("user", "name")
      .lean();

    // Map replies to their reviews
    const replyMap = {};
    replies.forEach((reply) => {
      replyMap[reply.review.toString()] = reply;
    });

    // Attach reply to each review
    const reviewsWithReplies = reviews.map((review) => ({
      ...review,
      reply: replyMap[review._id.toString()] || null,
    }));

    res.json({
      reviews: reviewsWithReplies,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Dashboard reviews error:", err);
    sendServerError(res, err);
  }
});

/**
 * @route   POST /api/company-dashboard/:companyId/reviews/:reviewId/reply
 * @desc    Post a reply to a review (company response)
 */
router.post(
  "/:companyId/reviews/:reviewId/reply",
  protect,
  requireCompanyAccess,
  async (req, res) => {
    try {
      const { content } = req.body;

      if (!content || content.trim().length < 5) {
        return res
          .status(400)
          .json({ error: "Reply must be at least 5 characters" });
      }

      if (content.length > 1000) {
        return res
          .status(400)
          .json({ error: "Reply cannot exceed 1000 characters" });
      }

      // Check the review belongs to this company
      const review = await Review.findOne({
        _id: req.params.reviewId,
        company: req.company._id,
      });

      if (!review) {
        return res
          .status(404)
          .json({ error: "Review not found for this company" });
      }

      // Check if already replied
      const existingReply = await ReviewReply.findOne({
        review: review._id,
      });

      if (existingReply) {
        return res
          .status(400)
          .json({ error: "You have already replied to this review" });
      }

      const reply = await ReviewReply.create({
        review: review._id,
        company: req.company._id,
        user: req.user._id,
        content: content.trim(),
      });

      // Populate user for the response
      await reply.populate("user", "name");

      res.status(201).json({
        message: "Reply posted successfully",
        reply,
      });
    } catch (err) {
      if (err.code === 11000) {
        return res
          .status(400)
          .json({ error: "You have already replied to this review" });
      }
      console.error("Reply error:", err);
      sendServerError(res, err);
    }
  }
);

/**
 * @route   PUT /api/company-dashboard/:companyId/reviews/:reviewId/reply
 * @desc    Edit an existing reply
 */
router.put(
  "/:companyId/reviews/:reviewId/reply",
  protect,
  requireCompanyAccess,
  async (req, res) => {
    try {
      const { content } = req.body;

      if (!content || content.trim().length < 5) {
        return res
          .status(400)
          .json({ error: "Reply must be at least 5 characters" });
      }

      const reply = await ReviewReply.findOne({
        review: req.params.reviewId,
        company: req.company._id,
      });

      if (!reply) {
        return res.status(404).json({ error: "Reply not found" });
      }

      reply.content = content.trim();
      await reply.save();

      await reply.populate("user", "name");

      res.json({
        message: "Reply updated",
        reply,
      });
    } catch (err) {
      console.error("Edit reply error:", err);
      sendServerError(res, err);
    }
  }
);

/**
 * @route   DELETE /api/company-dashboard/:companyId/reviews/:reviewId/reply
 * @desc    Delete a reply
 */
router.delete(
  "/:companyId/reviews/:reviewId/reply",
  protect,
  requireCompanyAccess,
  async (req, res) => {
    try {
      const reply = await ReviewReply.findOneAndDelete({
        review: req.params.reviewId,
        company: req.company._id,
      });

      if (!reply) {
        return res.status(404).json({ error: "Reply not found" });
      }

      res.json({ message: "Reply deleted" });
    } catch (err) {
      console.error("Delete reply error:", err);
      sendServerError(res, err);
    }
  }
);

/**
 * @route   PUT /api/company-dashboard/:companyId/profile
 * @desc    Update company profile (name, description, url, logo)
 */
router.put("/:companyId/profile", protect, requireCompanyAccess, async (req, res) => {
  try {
    const { description, url, logo } = req.body || {};
    const company = req.company;

    // Only update allowed fields (not name/slug — those need admin approval)
    if (description !== undefined) {
      // Plain text, capped like brand descriptions
      if (typeof description !== "string" || description.trim().length > 2000) {
        return res.status(400).json({ error: "Description must be text of up to 2000 characters" });
      }
      company.description = description.trim();
    }
    // Website and logo must be web links ("javascript:" etc. are refused).
    // Unchanged values are skipped, so an old value saved before these checks
    // existed never blocks editing the description.
    if (url !== undefined && url !== company.url) {
      const safeUrl = normalizeHttpUrl(url);
      if (safeUrl === null) return res.status(400).json({ error: "Website must be a valid http(s) link" });
      company.url = safeUrl;
    }
    if (logo !== undefined && logo !== company.logo) {
      const safeLogo = normalizeHttpUrl(logo);
      if (safeLogo === null) return res.status(400).json({ error: "Logo must be a valid http(s) link" });
      company.logo = safeLogo;
    }

    await company.save();

    res.json({
      message: "Company profile updated",
      company: {
        _id: company._id,
        name: company.name,
        slug: company.slug,
        description: company.description,
        url: company.url,
        logo: company.logo,
      },
    });
  } catch (err) {
    console.error("Profile update error:", err);
    sendServerError(res, err);
  }
});

module.exports = router;
