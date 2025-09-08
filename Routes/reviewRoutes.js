const express = require("express");
const Review = require("../models/Review");
const Company = require("../models/Company");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const router = express.Router();
const { getMixedReviews } = require("../controllers/reviewController");

/**
 * @route   POST /api/reviews
 * @desc    Create a new review for a company
 * @access  Protected (requires login)
 */
router.post("/", protect, async (req, res) => {
  try {
    const { companyId, rating, comment, title } = req.body;

    // Logged-in user comes from authMiddleware
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
 * @desc    Get all reviews for a specific company
 * @access  Public
 */
router.get("/company/:companyId", async (req, res) => {
  try {
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
      .sort({ createdAt: -1 }); // newest first

    res.json(reviews);
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

module.exports = router;
