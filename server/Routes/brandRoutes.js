/**
 * Public brand routes, used by the brand page.
 *   GET /api/brands/:slug            brand info + overall rating + state list
 *   GET /api/brands/:slug/locations  paginated locations (filter by state/city)
 */
const express = require("express");
const router = express.Router();
const Brand = require("../models/Brand");
const { getBrandSummary, listBrandLocations } = require("../utils/brands");

/**
 * Load a brand by slug, or send 404 and return null.
 */
async function findBrandBySlugOr404(req, res) {
  // Slugs are short lower-case strings; reject anything else early
  const slug = String(req.params.slug || "").toLowerCase();
  // Look the brand up with its category name for the header
  const brand = await Brand.findOne({ slug }).populate("category", "name slug").lean();
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

module.exports = router;
