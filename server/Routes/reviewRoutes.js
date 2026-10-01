const express = require("express");
const Review = require("../models/Review");
const Company = require("../models/Company");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const ReviewReply = require("../models/ReviewReply");
const UserReviewReply = require("../models/UserReviewReply");
const router = express.Router();
const { getMixedReviews } = require("../controllers/reviewController");
// Sort options shared with brand reviews
const { reviewSortFor } = require("../utils/reviewSort");

/**
 * @route   POST /api/reviews
 * @desc    Create a new review for a company
 * @access  Protected (requires login)
 */
router.post("/", protect, async (req, res) => {
  try {
    const { companyId, rating, comment, title } = req.body;

    // Logged-in user comes from protect
    const userId = req.user._id;

    // Ensure company exists
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: "Company not found" });

    // Check if user already reviewed this company
    const existingReview = await Review.findOne({
      company: companyId,
      user: userId,
    });

    if (existingReview) {
      return res.status(400).json({
        error:
          "You have already reviewed this company. You can update your existing review instead.",
      });
    }

    // Create review
    const review = new Review({
      company: companyId,
      user: userId,
      rating: parseInt(rating),
      comment: comment.trim(),
      title: title?.trim() || "Review",
    });

    await review.save();

    // Populate the review with user and company info before sending response
    const populatedReview = await Review.findById(review._id)
      .populate("user", "name profileImage")
      .populate("company", "name url logo category");

    res.status(201).json(populatedReview);
  } catch (err) {
    console.error("Error creating review:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   GET /api/reviews
 * @desc    Get all reviews with user + company info (for homepage)
 * @access  Public
 */
router.get("/", async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate("user", "name profileImage")
      .populate("company", "name url logo category")
      .sort({ createdAt: -1 }) // newest first
      .limit(50); // limit for performance

    res.json(reviews);
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   GET /api/reviews/company/:companyId
 * @desc    Get reviews for a specific company (with sort + pagination)
 * @query   sort=newest|oldest|highest|lowest  (default: newest)
 * @query   page=1,2,3...  (default: 1)
 * @query   limit=10,20,50  (default: 20, max: 50)
 * @access  Public
 */
router.get("/company/:companyId", async (req, res) => {
  try {
    const { sort = "newest", page = 1, limit = 20 } = req.query;

    // Shared sort options (unknown values mean newest)
    const sortBy = reviewSortFor(sort);

    // Pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Get total count for pagination info
    const total = await Review.countDocuments({ company: req.params.companyId });

    const reviews = await Review.find({ company: req.params.companyId })
      .populate("user", "name profileImage")
      .populate({
        path: "company",
        select: "name url logo category",
        populate: {
          path: "category",
          select: "name slug",
        },
      })
      .sort(sortBy)
      .skip(skip)
      .limit(limitNum);

    res.json({
      reviews,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: skip + reviews.length < total,
      },
    });
  } catch (err) {
    console.error("Error fetching company reviews:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   GET /api/reviews/user/:userId
 * @desc    Get all reviews written by a specific user
 * @access  Public
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const reviews = await Review.find({ user: req.params.userId })
      .populate("user", "name profileImage")
      .populate({
        path: "company",
        select: "name url logo category slug",
        populate: {
          path: "category",
          select: "name slug",
        },
      })
      .sort({ createdAt: -1 }); // newest first

    res.json(reviews);
  } catch (err) {
    console.error("Error fetching user reviews:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   PUT /api/reviews/:reviewId
 * @desc    Update a review (only by the author)
 * @access  Protected
 */
router.put("/:reviewId", protect, async (req, res) => {
  try {
    const { rating, comment, title } = req.body;
    const reviewId = req.params.reviewId;
    const userId = req.user._id;

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    // Check if the logged-in user is the author
    if (review.user.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "You can only edit your own reviews" });
    }

    // Update the review
    review.rating = rating || review.rating;
    review.comment = comment?.trim() || review.comment;
    review.title = title?.trim() || review.title;

    await review.save();

    // Return populated review
    const updatedReview = await Review.findById(reviewId)
      .populate("user", "name profileImage")
      .populate("company", "name url logo category");

    res.json(updatedReview);
  } catch (err) {
    console.error("Error updating review:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   DELETE /api/reviews/:reviewId
 * @desc    Delete a review (only by the author)
 * @access  Protected
 */
router.delete("/:reviewId", protect, async (req, res) => {
  try {
    const reviewId = req.params.reviewId;
    const userId = req.user._id;

    // Find the review
    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    // Check if the logged-in user is the author
    if (review.user.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "You can only delete your own reviews" });
    }

    // Delete the review
    await Review.findByIdAndDelete(reviewId);

    res.json({ message: "Review deleted successfully" });
  } catch (err) {
    console.error("Error deleting review:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   GET /api/reviews/stats/:companyId
 * @desc    Get review statistics for a company
 * @access  Public
 */
router.get("/stats/:companyId", async (req, res) => {
  try {
    const companyId = req.params.companyId;

    // Get all reviews for this company
    const reviews = await Review.find({ company: companyId });

    if (reviews.length === 0) {
      return res.json({
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      });
    }

    // Calculate statistics
    const totalReviews = reviews.length;
    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = (totalRating / totalReviews).toFixed(1);

    // Rating distribution
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((review) => {
      ratingDistribution[review.rating]++;
    });

    res.json({
      totalReviews,
      averageRating: parseFloat(averageRating),
      ratingDistribution,
    });
  } catch (err) {
    console.error("Error fetching review stats:", err);
    res.status(500).json({ error: err.message });
  }
});
// Add this route
router.get("/browse-mixed", getMixedReviews);

/**
 * @route   GET /api/reviews/:reviewId
 * @desc    Get single review with full details
 * @access  Public
 */
router.get("/:reviewId", async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId)
      .populate("user", "name profileImage")
      .populate({
        path: "company",
        select: "name slug url logo companyImage category",
        populate: {
          path: "category",
          select: "name slug",
        },
      });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    res.json(review);
  } catch (err) {
    console.error("Error fetching single review:", err);
    res.status(500).json({ error: err.message });
  }
});


/**
 * @route   GET /api/reviews/:reviewId/replies
 * @desc    Get the company reply for a review (public)
 * @access  Public
 */
router.get("/:reviewId/replies", async (req, res) => {
  try {
    const reply = await ReviewReply.findOne({ review: req.params.reviewId })
      .populate("user", "name profileImage")
      .lean();

    res.json(reply || null);
  } catch (err) {
    console.error("Error fetching review reply:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   GET /api/reviews/company/:companyId/with-replies
 * @desc    Get reviews for a company WITH their company replies (sort + pagination)
 * @query   sort=newest|oldest|highest|lowest  (default: newest)
 * @query   page=1,2,3...  (default: 1)
 * @query   limit=10,20,50  (default: 20, max: 50)
 * @access  Public
 */
router.get("/company/:companyId/with-replies", async (req, res) => {
  try {
    const { sort = "newest", page = 1, limit = 20 } = req.query;

    // Shared sort options (unknown values mean newest)
    const sortBy = reviewSortFor(sort);

    // Pagination
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Get total count
    const total = await Review.countDocuments({ company: req.params.companyId });

    const reviews = await Review.find({ company: req.params.companyId })
      .populate("user", "name profileImage")
      .populate({
        path: "company",
        select: "name url logo category",
        populate: { path: "category", select: "name slug" },
      })
      .sort(sortBy)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get all replies for these reviews in one query
    const reviewIds = reviews.map((r) => r._id);
    const replies = await ReviewReply.find({ review: { $in: reviewIds } })
      .populate("user", "name profileImage")
      .lean();

    const replyMap = {};
    replies.forEach((reply) => {
      replyMap[reply.review.toString()] = reply;
    });

    // Also get user replies to company responses
    const userReplies = await UserReviewReply.find({ review: { $in: reviewIds } }).lean();
    const userReplyMap = {};
    userReplies.forEach((ur) => {
      userReplyMap[ur.review.toString()] = ur;
    });

    const reviewsWithReplies = reviews.map((review) => ({
      ...review,
      companyReply: replyMap[review._id.toString()] || null,
      userReply: userReplyMap[review._id.toString()] || null,
    }));

    res.json({
      reviews: reviewsWithReplies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: skip + reviews.length < total,
      },
    });
  } catch (err) {
    console.error("Error fetching reviews with replies:", err);
    res.status(500).json({ error: err.message });
  }
});


// POST - User replies to a company response
router.post("/:reviewId/user-reply", protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Reply content is required" });
    }
    if (content.trim().length > 2000) {
      return res.status(400).json({ error: "Reply content must be 2000 characters or less" });
    }

    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (review.user.toString() !== req.user._id.toString())
      return res.status(403).json({ error: "Only the review author can reply" });

    const existing = await UserReviewReply.findOne({ review: review._id });
    if (existing) return res.status(400).json({ error: "You already replied to this company response" });

    const reply = await UserReviewReply.create({
      review: review._id,
      user: req.user._id,
      content: content.trim(),
    });
    res.status(201).json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT - Update user reply
router.put("/:reviewId/user-reply", protect, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Reply content is required" });
    }
    if (content.trim().length > 2000) {
      return res.status(400).json({ error: "Reply content must be 2000 characters or less" });
    }

    const reply = await UserReviewReply.findOne({ review: req.params.reviewId, user: req.user._id });
    if (!reply) return res.status(404).json({ error: "Reply not found" });
    reply.content = content.trim();
    await reply.save();
    res.json({ success: true, reply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE - Delete user reply
router.delete("/:reviewId/user-reply", protect, async (req, res) => {
  try {
    const reply = await UserReviewReply.findOneAndDelete({ review: req.params.reviewId, user: req.user._id });
    if (!reply) return res.status(404).json({ error: "Reply not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
