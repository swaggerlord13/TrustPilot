/**
 * Deleting things together with everything that belongs to them, so no
 * leftovers point at records that no longer exist (which crashed pages,
 * e.g. a business owner's company list after the company was deleted).
 */
const Review = require("../models/Review");
const ReviewReply = require("../models/ReviewReply");
const UserReviewReply = require("../models/UserReviewReply");
const Company = require("../models/Company");
const CompanyClaim = require("../models/CompanyClaim");

/**
 * Delete the reviews matching `filter` plus the replies to them
 * (the business's reply and the author's answer). Returns how many reviews.
 */
async function deleteReviewsWhere(filter) {
  // Ids first, so the replies can be found
  const ids = await Review.distinct("_id", filter);
  if (!ids.length) return 0;
  // Replies to those reviews
  await Promise.all([
    ReviewReply.deleteMany({ review: { $in: ids } }),
    UserReviewReply.deleteMany({ review: { $in: ids } }),
  ]);
  // Then the reviews themselves
  const result = await Review.deleteMany({ _id: { $in: ids } });
  return result.deletedCount;
}

/**
 * Delete companies with their reviews (and replies) and business claims.
 * Returns how many companies were deleted.
 */
async function deleteCompaniesCascade(companyIds) {
  if (!companyIds.length) return 0;
  // Everything that points at the companies goes first
  await deleteReviewsWhere({ company: { $in: companyIds } });
  // Business replies left over from earlier deletes (they also carry the company)
  await ReviewReply.deleteMany({ company: { $in: companyIds } });
  await CompanyClaim.deleteMany({ company: { $in: companyIds } });
  // Then the companies
  const result = await Company.deleteMany({ _id: { $in: companyIds } });
  return result.deletedCount;
}

module.exports = { deleteReviewsWhere, deleteCompaniesCascade };
