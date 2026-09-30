const mongoose = require("mongoose");

/**
 * ReviewReply — a company's official response to a review.
 *
 * Only users with an approved CompanyClaim for the review's company
 * can post a reply. Each review can have at most one company reply
 * (enforced by a unique index on the review field).
 */
const reviewReplySchema = new mongoose.Schema(
  {
    review: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // The company rep who wrote the reply
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minLength: [5, "Reply must be at least 5 characters"],
      maxLength: [1000, "Reply cannot exceed 1000 characters"],
    },
  },
  { timestamps: true }
);

// One reply per review (company can only respond once)
reviewReplySchema.index({ review: 1 }, { unique: true });

// Quick lookup: all replies by a company
reviewReplySchema.index({ company: 1, createdAt: -1 });

module.exports = mongoose.model("ReviewReply", reviewReplySchema);
