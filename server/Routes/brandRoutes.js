/**
 * Public brand routes, used by the brand page.
 *   GET /api/brands/:slug            brand info + overall rating + state list
 *   GET /api/brands/:slug/locations  paginated locations (filter by state/city)
 *   GET    /api/brands/:slug/reviews            reviews of the brand as a whole
 *   GET    /api/brands/:slug/reviews/mine       the logged-in user's review (or null)
 *   POST   /api/brands/:slug/reviews            write a review (logged in)
 *   PUT    /api/brands/:slug/reviews/:reviewId  edit your own review
 *   DELETE /api/brands/:slug/reviews/:reviewId  delete your own review
 */
const express = require("express");
const router = express.Router();
const Brand = require("../models/Brand");
const { getBrandSummary, listBrandLocations, isValidId } = require("../utils/brands");
// Reviews of the brand as a whole
const BrandReview = require("../models/BrandReview");
// Login check for writing/editing/deleting reviews
const { protect } = require("../middleware/authMiddleware");

// Sort options shared with location reviews
const { reviewSortFor } = require("../utils/reviewSort");

// Largest page size the reviews list accepts
const MAX_REVIEWS_PAGE_SIZE = 50;

// Author fields shown next to a review (never email or password)
const AUTHOR_FIELDS = "name profileImage";

/**
 * Load a brand by slug, or send 404 and return null.
 */
async function findBrandBySlugOr404(req, res, { idOnly = false } = {}) {
  // Slugs are short lower-case strings; reject anything else early
  const slug = String(req.params.slug || "").toLowerCase();
  // Review routes only need the id; the header also needs details and category
  const brand = idOnly
    ? await Brand.findOne({ slug }).select("_id").lean()
    : await Brand.findOne({ slug }).populate("category", "name slug").lean();
  // Unknown slug: tell the client the brand doesn't exist
  if (!brand) res.status(404).json({ error: "Brand not found" });
  // Brand document, or null when a 404 was sent
  return brand;
}

/**
 * GET /api/brands/:slug
 * Brand header data: details, overall rating across all locations,
 * number of locations, and the states/cities for the filters.
 */
router.get("/:slug", async (req, res) => {
  try {
    // Brand by slug, or stop after the 404
    const brand = await findBrandBySlugOr404(req, res);
    if (!brand) return;
    // Rating, location count and state list
    const summary = await getBrandSummary(brand);
    // Brand plus its summary
    res.json({ brand, ...summary });
  } catch (err) {
    // Log the details, keep the response generic
    console.error("Get brand error:", err.message);
    res.status(500).json({ error: "Failed to load brand" });
  }
});

/**
 * GET /api/brands/:slug/locations?state=Lagos&city=Ikeja&page=1&limit=20
 * One page of the brand's locations, each with its own rating.
 */
router.get("/:slug/locations", async (req, res) => {
  try {
    // Brand by slug, or stop after the 404
    const brand = await findBrandBySlugOr404(req, res);
    if (!brand) return;
    // Query values arrive as strings; anything else (arrays, objects) is ignored
    const { state, city, page, limit } = req.query;
    // Filtered, paginated locations with ratings
    const result = await listBrandLocations(brand._id, {
      state: typeof state === "string" ? state : undefined,
      city: typeof city === "string" ? city : undefined,
      page,
      limit,
    });
    // Locations plus pagination info
    res.json(result);
  } catch (err) {
    // Log the details, keep the response generic
    console.error("List brand locations error:", err.message);
    res.status(500).json({ error: "Failed to load brand locations" });
  }
});

/**
 * Pick the fields a user may set on a review from a request body. Values are
 * checked by the BrandReview model (one set of rules), not here.
 * Only fields that were sent are returned, so edits change just those.
 */
function pickReviewFields(body) {
  // Only these fields may be set by the client
  const data = {};
  // Rating as sent ("4" is fine; the model turns it into 4 and checks 1..5)
  if (body.rating !== undefined) data.rating = body.rating;
  // Comment as sent (the model trims it and checks the length)
  if (body.comment !== undefined) data.comment = body.comment;
  // An empty title means the default "Review"
  if (body.title !== undefined) {
    data.title = typeof body.title === "string" && body.title.trim() === "" ? "Review" : body.title;
  }
  return data;
}

/**
 * A short, readable message from a Mongoose ValidationError, e.g.
 * "Comment must be at least 10 characters long" or "Invalid rating".
 */
function validationMessage(err) {
  // First field that failed
  const first = Object.values(err.errors || {})[0];
  // Nothing specific: generic message
  if (!first) return "Invalid review";
  // Wrong type (e.g. rating "abc", or an object instead of text)
  if (first.name === "CastError") return `Invalid ${first.path}`;
  // The model's own message
  return first.message;
}

/**
 * GET /api/brands/:slug/reviews?sort=newest&page=1&limit=10
 * Reviews of the brand as a whole, with author name and photo.
 */
router.get("/:slug/reviews", async (req, res) => {
  try {
    // Brand by slug (id only), or stop after the 404
    const brand = await findBrandBySlugOr404(req, res, { idOnly: true });
    if (!brand) return;
    // Clamp paging values to safe numbers
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_REVIEWS_PAGE_SIZE, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    // Total for paging, and this page of reviews, in parallel
    const [total, reviews] = await Promise.all([
      BrandReview.countDocuments({ brand: brand._id }),
      BrandReview.find({ brand: brand._id })
        .populate("user", AUTHOR_FIELDS)
        // Shared sort options; unknown values mean newest
        .sort(reviewSortFor(req.query.sort))
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    // Reviews plus paging info (same shape as the locations list)
    res.json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    // Log the details, keep the response generic
    console.error("List brand reviews error:", err.message);
    res.status(500).json({ error: "Failed to load brand reviews" });
  }
});

/**
 * GET /api/brands/:slug/reviews/mine
 * The logged-in user's review of this brand, or { review: null }.
 * Lets the page offer "Edit your review" instead of a blank form.
 */
router.get("/:slug/reviews/mine", protect, async (req, res) => {
  try {
    // Brand by slug (id only), or stop after the 404
    const brand = await findBrandBySlugOr404(req, res, { idOnly: true });
    if (!brand) return;
    // This user's review of this brand, if any
    const review = await BrandReview.findOne({ brand: brand._id, user: req.user._id })
      .populate("user", AUTHOR_FIELDS)
      .lean();
    res.json({ review });
  } catch (err) {
    console.error("Get my brand review error:", err.message);
    res.status(500).json({ error: "Failed to load your review" });
  }
});

/**
 * POST /api/brands/:slug/reviews
 * Body: { rating, comment, title? }. One review per user per brand.
 */
router.post("/:slug/reviews", protect, async (req, res) => {
  try {
    // Brand by slug (id only), or stop after the 404
    const brand = await findBrandBySlugOr404(req, res, { idOnly: true });
    if (!brand) return;
    // Friendly check first; the unique index still catches two posts at once
    if (await BrandReview.exists({ brand: brand._id, user: req.user._id })) {
      return res.status(409).json({ error: "You have already reviewed this brand. You can edit your review instead." });
    }
    // Model checks the values; brand and author always come from the server
    const review = new BrandReview({ ...pickReviewFields(req.body || {}), brand: brand._id, user: req.user._id });
    await review.save();
    // The brand was deleted while we were saving: don't leave an orphan behind
    if (!(await Brand.exists({ _id: brand._id }))) {
      await review.deleteOne();
      return res.status(404).json({ error: "Brand not found" });
    }
    // Add the author's name and photo for the page (no extra lookup of the review)
    await review.populate("user", AUTHOR_FIELDS);
    res.status(201).json({ review });
  } catch (err) {
    // Already reviewed this brand (unique index, e.g. a double click)
    if (err.code === 11000) {
      return res.status(409).json({ error: "You have already reviewed this brand. You can edit your review instead." });
    }
    // Rating/comment/title broke a rule in the model
    if (err.name === "ValidationError") return res.status(400).json({ error: validationMessage(err) });
    console.error("Create brand review error:", err.message);
    res.status(500).json({ error: "Failed to save review" });
  }
});

/**
 * Load a review of this brand written by the logged-in user, or send the
 * right error (400 bad id, 404 not found, 403 someone else's) and return null.
 */
async function findOwnReviewOrError(req, res) {
  // Reject malformed ids before querying
  if (!isValidId(req.params.reviewId)) {
    res.status(400).json({ error: "Invalid review ID" });
    return null;
  }
  // Brand by slug (id only), or stop after the 404
  const brand = await findBrandBySlugOr404(req, res, { idOnly: true });
  if (!brand) return null;
  // The review must belong to this brand
  const review = await BrandReview.findOne({ _id: req.params.reviewId, brand: brand._id });
  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return null;
  }
  // Only the author may change it
  if (String(review.user) !== String(req.user._id)) {
    res.status(403).json({ error: "You can only change your own review" });
    return null;
  }
  return review;
}

/**
 * PUT /api/brands/:slug/reviews/:reviewId
 * Body: any of { rating, comment, title }. Author only.
 */
router.put("/:slug/reviews/:reviewId", protect, async (req, res) => {
  try {
    // The user's own review, or stop after the error response
    const review = await findOwnReviewOrError(req, res);
    if (!review) return;
    // Change only the fields that were sent; the model checks them on save
    Object.assign(review, pickReviewFields(req.body || {}));
    await review.save();
    // Add the author's name and photo (no extra lookup of the review)
    await review.populate("user", AUTHOR_FIELDS);
    res.json({ review });
  } catch (err) {
    // Rating/comment/title broke a rule in the model
    if (err.name === "ValidationError") return res.status(400).json({ error: validationMessage(err) });
    console.error("Update brand review error:", err.message);
    res.status(500).json({ error: "Failed to update review" });
  }
});

/**
 * DELETE /api/brands/:slug/reviews/:reviewId
 * Author only.
 */
router.delete("/:slug/reviews/:reviewId", protect, async (req, res) => {
  try {
    // The user's own review, or stop after the error response
    const review = await findOwnReviewOrError(req, res);
    if (!review) return;
    // Remove it
    await review.deleteOne();
    res.json({ message: "Review deleted" });
  } catch (err) {
    console.error("Delete brand review error:", err.message);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;
