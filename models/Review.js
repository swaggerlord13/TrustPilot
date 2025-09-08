const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true, // Review must belong to a company
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // Review must come from a user
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: function (v) {
          return Number.isInteger(v) && v >= 1 && v <= 5;
        },
        message: "Rating must be an integer between 1 and 5",
      },
    }, // Star rating (1-5)
    comment: {
      type: String,
      required: true,
      trim: true,
      minLength: [10, "Comment must be at least 10 characters long"],
      maxLength: [1000, "Comment cannot exceed 1000 characters"],
    }, // Review text
    title: {
      type: String,
      trim: true,
      maxLength: [100, "Title cannot exceed 100 characters"],
      default: "Review",
    }, // Optional review title
    isVerified: {
      type: Boolean,
      default: false, // For future feature - verified purchases
    },
    helpfulVotes: {
      type: Number,
      default: 0, // For future feature - helpful votes
    },
    reportCount: {
      type: Number,
      default: 0, // For future moderation feature
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
reviewSchema.index({ company: 1, createdAt: -1 });
reviewSchema.index({ user: 1, createdAt: -1 });
reviewSchema.index({ rating: 1 });

// Compound index to prevent duplicate reviews from same user for same company
reviewSchema.index({ company: 1, user: 1 }, { unique: true });

// Virtual for review age
reviewSchema.virtual("age").get(function () {
  const now = new Date();
  const diff = now - this.createdAt;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
});

// Static method to get average rating for a company
reviewSchema.statics.getAverageRating = async function (companyId) {
  const pipeline = [
    { $match: { company: mongoose.Types.ObjectId(companyId) } },
    {
      $group: {
        _id: "$company",
        averageRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ];

  const result = await this.aggregate(pipeline);
  return result.length > 0 ? result[0] : { averageRating: 0, totalReviews: 0 };
};

// Instance method to check if review is recent (within 30 days)
reviewSchema.methods.isRecent = function () {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return this.createdAt > thirtyDaysAgo;
};

// Pre-save middleware to ensure comment is not empty
reviewSchema.pre("save", function (next) {
  if (this.comment && this.comment.trim().length === 0) {
    this.comment = undefined; // This will trigger the required validation
  }
  next();
});

// Post-save middleware to update company's average rating (for future use)
reviewSchema.post("save", async function () {
  try {
    // This could be used to update a denormalized avgRating field on Company model
    // const stats = await this.constructor.getAverageRating(this.company);
    // await mongoose.model('Company').findByIdAndUpdate(this.company, {
    //   avgRating: stats.averageRating,
    //   reviewCount: stats.totalReviews
    // });
  } catch (error) {
    console.error("Error updating company rating:", error);
  }
});

module.exports = mongoose.model("Review", reviewSchema);
