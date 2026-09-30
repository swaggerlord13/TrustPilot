const mongoose = require("mongoose");

const userReviewReplySchema = new mongoose.Schema({
  review: { type: mongoose.Schema.Types.ObjectId, ref: "Review", required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true, trim: true, minLength: [5, "Reply must be at least 5 characters"], maxLength: [1000, "Reply cannot exceed 1000 characters"] },
}, { timestamps: true });

// One user reply per review
userReviewReplySchema.index({ review: 1 }, { unique: true });

module.exports = mongoose.model("UserReviewReply", userReviewReplySchema);
