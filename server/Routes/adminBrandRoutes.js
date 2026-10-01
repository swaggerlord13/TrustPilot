/**
 * Admin brand management. Mounted at /api/admin/brands; every route requires
 * a logged-in admin.
 *   GET    /                         list/search brands (with location counts)
 *   POST   /                         create a brand
 *   PUT    /:id                      edit a brand
 *   DELETE /:id                      delete a brand (its locations are kept)
 *   GET    /:id/suggestions          unbranded companies that look like this brand
 *   POST   /:id/locations            attach companies to the brand
 *   DELETE /:id/locations/:companyId detach one company from the brand
 *   GET    /reviews                  brand reviews, newest first (moderation)
 *   DELETE /reviews/:reviewId        delete any brand review (moderation)
 */
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
const Brand = require("../models/Brand");
const Company = require("../models/Company");
const Category = require("../models/Category");
// Reviews of whole brands, for moderation and clean-up
const BrandReview = require("../models/BrandReview");
const { escapeRegex, isValidId } = require("../utils/brands");
// Safe http(s) links for website/logo (shared with the business dashboard)
const { normalizeHttpUrl } = require("../utils/input");

// Every route in this file: logged in AND admin
router.use(protect, admin);

// Most companies an admin can attach in one request
const MAX_ATTACH = 200;

/**
 * Validate and pick the editable brand fields from a request body.
 * Returns { data } on success or { error } with a message for the admin.
 */
async function readBrandBody(body, { requireName, current = null }) {
  // Only these fields may be set by the client
  const data = {};
  // Name: required on create, optional on edit
  if (body.name !== undefined || requireName) {
    // Text form of the name
    const name = typeof body.name === "string" ? body.name.trim() : "";
    // Must be present and reasonably short
    if (!name || name.length > 100) return { error: "Name is required (max 100 characters)" };
    data.name = name;
  }
  // Website: must be an http(s) URL when given
  // Unchanged values are skipped, so an old value saved before these checks
  // existed never blocks editing the brand's other fields
  if (body.website !== undefined && body.website !== current?.website) {
    const website = normalizeHttpUrl(body.website);
    if (website === null) return { error: "Website must be a valid http(s) URL" };
    data.website = website;
  }
  // Logo: same URL rule as the website
  if (body.logo !== undefined && body.logo !== current?.logo) {
    const logo = normalizeHttpUrl(body.logo);
    if (logo === null) return { error: "Logo must be a valid http(s) URL" };
    data.logo = logo;
  }
  // Description: plain text, capped in length
  if (body.description !== undefined) {
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 2000) return { error: "Description is too long (max 2000 characters)" };
    data.description = description;
  }
  // Category: must be an existing category id, or empty to clear it
  if (body.category !== undefined) {
    if (body.category === "" || body.category === null) {
      // Clear the category
      data.category = null;
    } else if (!isValidId(body.category) || !(await Category.exists({ _id: body.category }))) {
      return { error: "Category not found" };
    } else {
      data.category = body.category;
    }
  }
  // All fields valid
  return { data };
}

/**
 * Send a clear 409 when a brand with the same name or website already exists.
 */
function sendDuplicateOr500(res, err, fallback) {
  // 11000 = MongoDB unique index violation; keyPattern says which field
  if (err.code === 11000) {
    // Same website as another brand
    if (err.keyPattern?.domain) return res.status(409).json({ error: "Another brand already uses this website" });
    // Same name (nameKey) as another brand
    return res.status(409).json({ error: "A brand with this name already exists" });
  }
  // Anything else: log it, keep the response generic
  console.error(fallback, err.message);
  return res.status(500).json({ error: fallback });
}

/**
 * GET /api/admin/brands?search=mtn&page=1
 * Brands with how many locations each has, newest first.
 */
router.get("/", async (req, res) => {
  try {
    // Page number, at least 1
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    // Fixed page size for the admin table
    const limit = 20;
    // Optional name search (string only)
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    // Name contains the search text, case-insensitive
    const filter = search ? { name: { $regex: escapeRegex(search), $options: "i" } } : {};
    // Count and page of brands in parallel
    const [total, brands] = await Promise.all([
      Brand.countDocuments(filter),
      Brand.find(filter)
        .populate("category", "name")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    // Number of locations per brand on this page, in one query
    const counts = await Company.aggregate([
      { $match: { brand: { $in: brands.map((b) => b._id) } } },
      { $group: { _id: "$brand", count: { $sum: 1 } } },
    ]);
    // Look counts up by brand id
    const countById = new Map(counts.map((c) => [String(c._id), c.count]));
    // Brands with their location count
    res.json({
      brands: brands.map((b) => ({ ...b, locationCount: countById.get(String(b._id)) || 0 })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("List brands error:", err.message);
    res.status(500).json({ error: "Failed to load brands" });
  }
});

/**
 * GET /api/admin/brands/reviews?page=1
 * Every brand review, newest first, with brand and author, for moderation.
 * Declared before the "/:id" routes so "reviews" is never read as a brand id.
 */
router.get("/reviews", async (req, res) => {
  try {
    // Page number, at least 1
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    // Fixed page size for the admin table
    const limit = 20;
    // Count and page of reviews in parallel
    const [total, reviews] = await Promise.all([
      BrandReview.countDocuments(),
      BrandReview.find()
        .populate("brand", "name slug")
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    res.json({ reviews, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("List brand reviews (admin) error:", err.message);
    res.status(500).json({ error: "Failed to load brand reviews" });
  }
});

/**
 * DELETE /api/admin/brands/reviews/:reviewId
 * Remove any brand review (spam, abuse).
 */
router.delete("/reviews/:reviewId", async (req, res) => {
  try {
    // Reject malformed ids before querying
    if (!isValidId(req.params.reviewId)) return res.status(400).json({ error: "Invalid review ID" });
    // Delete and report whether it existed
    const review = await BrandReview.findByIdAndDelete(req.params.reviewId);
    if (!review) return res.status(404).json({ error: "Review not found" });
    res.json({ message: "Review deleted" });
  } catch (err) {
    console.error("Delete brand review (admin) error:", err.message);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

/**
 * POST /api/admin/brands
 * Body: { name, website?, logo?, description?, category? }
 */
router.post("/", async (req, res) => {
  try {
    // Validate the submitted fields (name required)
    const { data, error } = await readBrandBody(req.body || {}, { requireName: true });
    if (error) return res.status(400).json({ error });
    // Create; the model fills slug, nameKey and domain
    const brand = await Brand.create(data);
    res.status(201).json({ brand });
  } catch (err) {
    sendDuplicateOr500(res, err, "Failed to create brand");
  }
});

/**
 * PUT /api/admin/brands/:id
 * Body: any of { name, website, logo, description, category }
 */
router.put("/:id", async (req, res) => {
  try {
    // Reject malformed ids before querying
    if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid brand ID" });
    // Load the brand so model hooks (slug/domain) run on save
    const brand = await Brand.findById(req.params.id);
    if (!brand) return res.status(404).json({ error: "Brand not found" });
    // Validate only the fields that were sent (unchanged links are not re-checked)
    const { data, error } = await readBrandBody(req.body || {}, { requireName: false, current: brand });
    if (error) return res.status(400).json({ error });
    // Apply the validated changes and save
    Object.assign(brand, data);
    await brand.save();
    res.json({ brand });
  } catch (err) {
    sendDuplicateOr500(res, err, "Failed to update brand");
  }
});

/**
 * DELETE /api/admin/brands/:id
 * Deletes the brand and its brand-level reviews; its locations (and their
 * own reviews) stay, just without a brand.
 */
router.delete("/:id", async (req, res) => {
  try {
    // Reject malformed ids before querying
    if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid brand ID" });
    // Make sure the brand exists before changing anything
    if (!(await Brand.exists({ _id: req.params.id }))) return res.status(404).json({ error: "Brand not found" });
    // Detach its locations FIRST, so a failure can't leave companies
    // pointing at a brand that no longer exists
    // Brand is going away: its locations become free to be grouped again
    const result = await Company.updateMany(
      { brand: req.params.id },
      { $unset: { brand: "", brandSetByAdmin: "" }, $pull: { googleFilledFields: "brand" } }
    );
    // Then delete the brand itself. Done before its reviews: if this fails,
    // the brand and all its reviews are still intact
    await Brand.findByIdAndDelete(req.params.id);
    // Reviews of the brand as a whole have nothing to belong to any more.
    // (A review posted during the delete removes itself, see brandRoutes.)
    const reviews = await BrandReview.deleteMany({ brand: req.params.id });
    res.json({
      message: "Brand deleted",
      locationsDetached: result.modifiedCount,
      reviewsDeleted: reviews.deletedCount,
    });
  } catch (err) {
    console.error("Delete brand error:", err.message);
    res.status(500).json({ error: "Failed to delete brand" });
  }
});

/**
 * GET /api/admin/brands/:id/suggestions
 * Companies without a brand whose website domain matches the brand's, or
 * whose name starts with the brand name. Helps admins attach locations.
 */
router.get("/:id/suggestions", async (req, res) => {
  try {
    // Reject malformed ids before querying
    if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid brand ID" });
    const brand = await Brand.findById(req.params.id).lean();
    if (!brand) return res.status(404).json({ error: "Brand not found" });
    // Name is the brand name, or starts with it followed by a space,
    // e.g. "MTN" -> "MTN Ikeja" (works for names ending in "." or "é" too)
    const nameMatch = { name: { $regex: `^${escapeRegex(brand.name)}(\\s|$)`, $options: "i" } };
    // Domain match only when the brand has a website
    const either = brand.domain ? [{ domain: brand.domain }, nameMatch] : [nameMatch];
    // Unbranded companies (brand missing or null) matching either rule
    const companies = await Company.find({ brand: null, $or: either })
      .select("name slug city state country url domain")
      .sort({ name: 1 })
      .limit(100)
      .lean();
    res.json({ companies });
  } catch (err) {
    console.error("Brand suggestions error:", err.message);
    res.status(500).json({ error: "Failed to load suggestions" });
  }
});

/**
 * POST /api/admin/brands/:id/locations
 * Body: { companyIds: [...] }. Attaches those companies to the brand
 * (moving them out of any other brand).
 */
router.post("/:id/locations", async (req, res) => {
  try {
    // Reject malformed ids before querying
    if (!isValidId(req.params.id)) return res.status(400).json({ error: "Invalid brand ID" });
    // Company ids to attach, as an array
    const ids = Array.isArray(req.body?.companyIds) ? req.body.companyIds : [];
    // Need at least one, and not an unbounded list
    if (!ids.length || ids.length > MAX_ATTACH) {
      return res.status(400).json({ error: `Send between 1 and ${MAX_ATTACH} companyIds` });
    }
    // Every id must be well-formed
    if (!ids.every(isValidId)) return res.status(400).json({ error: "Invalid company ID in list" });
    // Brand must exist
    if (!(await Brand.exists({ _id: req.params.id }))) return res.status(404).json({ error: "Brand not found" });
    // Point all of them at this brand, mark it as an admin decision (so
    // automatic matching leaves it alone), and drop any old "brand came from
    // the Google link" record so unlinking can't undo this choice
    const result = await Company.updateMany(
      { _id: { $in: ids } },
      { $set: { brand: req.params.id, brandSetByAdmin: true }, $pull: { googleFilledFields: "brand" } }
    );
    res.json({ message: "Locations attached", attached: result.modifiedCount });
  } catch (err) {
    console.error("Attach locations error:", err.message);
    res.status(500).json({ error: "Failed to attach locations" });
  }
});

/**
 * DELETE /api/admin/brands/:id/locations/:companyId
 * Removes one company from the brand (the company itself is kept).
 */
router.delete("/:id/locations/:companyId", async (req, res) => {
  try {
    // Both ids must be well-formed
    if (!isValidId(req.params.id) || !isValidId(req.params.companyId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }
    // Only detach if it really belongs to this brand
    const result = await Company.updateOne(
      { _id: req.params.companyId, brand: req.params.id },
      // Remove the brand and remember an admin chose this, so automatic
      // matching (Google link, grouping script) won't add it back
      { $unset: { brand: "" }, $set: { brandSetByAdmin: true }, $pull: { googleFilledFields: "brand" } }
    );
    // Nothing matched: not part of this brand
    if (!result.matchedCount) return res.status(404).json({ error: "Location not found in this brand" });
    res.json({ message: "Location detached" });
  } catch (err) {
    console.error("Detach location error:", err.message);
    res.status(500).json({ error: "Failed to detach location" });
  }
});

module.exports = router;
