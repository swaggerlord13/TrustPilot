const mongoose = require("mongoose");

// A review of a whole brand (e.g. "MTN" in general), as opposed to a Review,
// which is about one location (e.g. "MTN Ikeja"). Kept in its own collection
// so every page that lists location reviews keeps working unchanged.
const brandReviewSchema = new mongoose.Schema(
  {
    // Brand being reviewed
    brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand", required: true },
    // Author of the review
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Whole stars from 1 to 5
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        // Reject 3.5 and the like
        validator: Number.isInteger,
        message: "Rating must be a whole number between 1 and 5",
      },
    },
    // Short headline; same limits as location reviews
    title: {
      type: String,
      trim: true,
      maxLength: [100, "Title cannot exceed 100 characters"],
      default: "Review",
    },
    // Review text; same limits as location reviews
    comment: {
      type: String,
      required: true,
      trim: true,
      minLength: [10, "Comment must be at least 10 characters long"],
      maxLength: [1000, "Comment cannot exceed 1000 characters"],
    },
  },
  // Adds createdAt / updatedAt
  { timestamps: true }
);

// One review per user per brand (also stops double-submits racing each other)
brandReviewSchema.index({ brand: 1, user: 1 }, { unique: true });
// Brand page lists newest first
brandReviewSchema.index({ brand: 1, createdAt: -1 });
// Rating sorts on the brand page
brandReviewSchema.index({ brand: 1, rating: -1, createdAt: -1 });

module.exports = mongoose.model("BrandReview", brandReviewSchema);
