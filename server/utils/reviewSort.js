/**
 * Sort options shared by every review list (location and brand reviews).
 */

// Allowed ?sort= values and the MongoDB sort each one means
const REVIEW_SORTS = {
  // Most recent first (the default)
  newest: { createdAt: -1 },
  // Earliest first
  oldest: { createdAt: 1 },
  // Best rated first, newest among equals
  highest: { rating: -1, createdAt: -1 },
  // Worst rated first, newest among equals
  lowest: { rating: 1, createdAt: -1 },
};

/**
 * MongoDB sort for a ?sort= value; anything unknown means newest.
 * Own-property check so values like "__proto__" or "constructor" can't
 * pick up something that isn't a sort.
 */
function reviewSortFor(value) {
  // Known option, or the default
  return typeof value === "string" && Object.hasOwn(REVIEW_SORTS, value)
    ? REVIEW_SORTS[value]
    : REVIEW_SORTS.newest;
}

module.exports = { REVIEW_SORTS, reviewSortFor };
