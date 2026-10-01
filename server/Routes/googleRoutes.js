const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Company = require("../models/Company");
const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
const { GooglePlacesError, searchText, getPlaceReviews } = require("../utils/googlePlaces");
const { mapGoogleToCategory, importPlaceAsCompany, ImportSkipError } = require("../utils/googleImport");
const { findCandidates, linkCompanyToPlace, unlinkCompany } = require("../utils/googleLink");

const MAX_BULK_IMPORT = 20;

function buildSearchQuery(query, country) {
  return country ? `${query} in ${country}` : query;
}

// Client errors (bad input, not found, duplicates) are safe to show.
// Server/Google failures are logged and replaced with a generic message so
// Google's error details (e.g. key problems) are never sent to browsers.
function sendGoogleError(res, err, fallbackMessage) {
  const status = err instanceof GooglePlacesError || err instanceof ImportSkipError ? err.status : 500;
  if (status < 500) {
    return res.status(status).json({ error: err.message, ...(err.extra || {}) });
  }
  console.error(fallbackMessage, err.message);
  return res.status(status).json({ error: fallbackMessage });
}

// ============================================================
// ROUTES
// ============================================================

/**
 * GET /api/google/reviews/:companyId
 * Live Google rating + up to 5 reviews for a company page.
 * Fetched from Google (cached briefly in memory), never stored in the DB.
 */
router.get("/reviews/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({ error: "Invalid company ID" });
    }

    const company = await Company.findById(companyId).select("googlePlaceId").lean();
    if (!company) return res.status(404).json({ error: "Company not found" });
    if (!company.googlePlaceId) {
      return res.status(404).json({ error: "This company is not linked to Google" });
    }

    const data = await getPlaceReviews(company.googlePlaceId);
    res.set("Cache-Control", "public, max-age=900");
    res.json(data);
  } catch (err) {
    sendGoogleError(res, err, "Failed to load Google reviews");
  }
});

/**
 * POST /api/google/search
 * Search Google Places for businesses in Africa
 * Body: { query, country }
 * Example: { query: "banks in Lagos", country: "Nigeria" }
 */
router.post("/search", protect, admin, async (req, res) => {
  try {
    const { query, country } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" });
    }

    const places = await searchText(buildSearchQuery(query, country));

    // Flag places that are already on the site so the admin UI can link to them
    const existing = await Company.find({ googlePlaceId: { $in: places.map((p) => p.placeId) } })
      .select("googlePlaceId slug")
      .lean();
    const slugByPlaceId = new Map(existing.map((c) => [c.googlePlaceId, c.slug]));

    const results = places.map((place) => ({
      ...place,
      suggestedCategory: mapGoogleToCategory(place.types, place.name),
      alreadyImported: slugByPlaceId.has(place.placeId),
      companySlug: slugByPlaceId.get(place.placeId) || null,
    }));

    res.json({ results, count: results.length });
  } catch (err) {
    sendGoogleError(res, err, "Failed to search Google Places");
  }
});

/**
 * POST /api/google/import
 * Import a single company from Google Places into our DB
 * Body: { placeId, categoryOverride? }
 */
router.post("/import", protect, admin, async (req, res) => {
  try {
    const { placeId, categoryOverride } = req.body;
    if (!placeId) return res.status(400).json({ error: "placeId is required" });

    const company = await importPlaceAsCompany(placeId, { categoryOverride });
    res.status(201).json({ message: "Company imported successfully", company });
  } catch (err) {
    sendGoogleError(res, err, "Failed to import company");
  }
});

/**
 * POST /api/google/bulk-import
 * Import multiple companies at once from a Google search
 * Body: { query, country, limit? }
 * Example: { query: "popular restaurants", country: "Nigeria", limit: 10 }
 */
router.post("/bulk-import", protect, admin, async (req, res) => {
  try {
    const { query, country } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Query is required" });
    }
    const limit = Math.min(Math.max(parseInt(req.body.limit, 10) || 10, 1), MAX_BULK_IMPORT);

    const places = await searchText(buildSearchQuery(query, country), { maxResults: limit });
    const imported = [];
    const skipped = [];

    for (const place of places) {
      try {
        const company = await importPlaceAsCompany(place.placeId);
        imported.push({ name: company.name, city: company.city, country: company.country });
      } catch (err) {
        // One bad place must not stop the rest of the batch
        const expected = err instanceof ImportSkipError || err instanceof GooglePlacesError;
        if (!expected) console.error(`Bulk import failed for ${place.placeId}:`, err.message);
        skipped.push({ name: place.name, reason: expected ? err.message : "Failed to import" });
      }
    }

    res.json({
      message: `Imported ${imported.length} companies, skipped ${skipped.length}`,
      imported,
      skipped,
    });
  } catch (err) {
    sendGoogleError(res, err, "Failed to bulk import");
  }
});

// ============================================================
// LINK EXISTING COMPANIES TO GOOGLE
// ============================================================

async function findCompanyOr404(req, res) {
  const { companyId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(companyId)) {
    res.status(400).json({ error: "Invalid company ID" });
    return null;
  }
  const company = await Company.findById(companyId).select("name city country googlePlaceId").lean();
  if (!company) res.status(404).json({ error: "Company not found" });
  return company;
}

/**
 * GET /api/google/link-candidates/:companyId
 * Google places that may be this company, best name match first.
 */
router.get("/link-candidates/:companyId", protect, admin, async (req, res) => {
  try {
    const company = await findCompanyOr404(req, res);
    if (!company) return;

    const candidates = await findCandidates(company);
    const linked = await Company.find({ googlePlaceId: { $in: candidates.map((c) => c.placeId) } })
      .select("googlePlaceId name slug")
      .lean();
    const linkedBy = new Map(linked.map((c) => [c.googlePlaceId, c]));

    res.json({
      company: { _id: company._id, name: company.name, googlePlaceId: company.googlePlaceId || null },
      candidates: candidates.map((c) => {
        const owner = linkedBy.get(c.placeId);
        return {
          ...c,
          linkedTo: owner && String(owner._id) !== String(company._id)
            ? { name: owner.name, slug: owner.slug }
            : null,
        };
      }),
    });
  } catch (err) {
    sendGoogleError(res, err, "Failed to search Google for this company");
  }
});

/**
 * POST /api/google/link/:companyId
 * Body: { placeId }. Links the company and fills its empty website/address/phone.
 */
router.post("/link/:companyId", protect, admin, async (req, res) => {
  try {
    const company = await findCompanyOr404(req, res);
    if (!company) return;
    const { placeId } = req.body;
    if (!placeId) return res.status(400).json({ error: "placeId is required" });

    const updated = await linkCompanyToPlace(company._id, placeId);
    res.json({ message: "Company linked to Google", company: updated });
  } catch (err) {
    sendGoogleError(res, err, "Failed to link company to Google");
  }
});

/**
 * POST /api/google/unlink/:companyId
 * Removes the Google link (e.g. after a wrong match). Keeps other details.
 */
router.post("/unlink/:companyId", protect, admin, async (req, res) => {
  try {
    const company = await findCompanyOr404(req, res);
    if (!company) return;
    const updated = await unlinkCompany(company._id);
    res.json({ message: "Google link removed", company: updated });
  } catch (err) {
    sendGoogleError(res, err, "Failed to unlink company");
  }
});

module.exports = router;
