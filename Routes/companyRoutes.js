// routes/companyRoutes.js
const express = require("express");
const router = express.Router();

const {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  getCompaniesByCategory,
  getCompaniesBySubcategory,
  getCompanyWithRatings, // NEW
  getBestCompaniesByCategory,
  getLatestBestReviews, // NEW
  getCompanyReviewsForDisplay, // Add this
} = require("../controllers/companyController");

const Company = require("../models/Company");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");

// ======================
// ✅ NEW OPTIMIZED ROUTES (put these BEFORE existing routes)
// ======================
// Add this route to companyRoutes.js (put it before other routes)
router.get("/latest-best-reviews", getLatestBestReviews);
// Get best companies by category (for homepage)
router.get("/best-by-category", getBestCompaniesByCategory);

// Get company with ratings by slug (for company page)
router.get("/slug/:slug/with-ratings", getCompanyWithRatings);

// ======================
// ✅ EXISTING ROUTES
// ======================

// GET all companies (with optional filters)
router.get("/", getCompanies);

// POST create company
router.post("/", createCompany);

// PUT update company
router.put("/:id", updateCompany);

// DELETE company
router.delete("/:id", deleteCompany);

// GET companies by category ID
router.get("/category/:categoryId", getCompaniesByCategory);

// GET companies by subcategory ID
router.get("/subcategory/:subcategoryId", getCompaniesBySubcategory);

// ======================
// ✅ EXISTING SLUG ROUTES
// ======================

// Get companies by Category slug
router.get("/category/slug/:slug", async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) return res.status(404).json({ error: "Category not found" });

    // Find subcategories under this category
    const subcategories = await SubCategory.find({ category: category._id });
    const subIds = subcategories.map((sub) => sub._id);

    // Find all companies under those subcategories
    const companies = await Company.find({ subcategory: { $in: subIds } });
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get companies by SubCategory slug
router.get("/subcategory/slug/:slug", async (req, res) => {
  try {
    const subcategory = await SubCategory.findOne({ slug: req.params.slug });
    if (!subcategory)
      return res.status(404).json({ error: "Subcategory not found" });

    const companies = await Company.find({ subcategory: subcategory._id });
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single company by slug (EXISTING - keep this)
router.get("/slug/:slug", async (req, res) => {
  try {
    const company = await Company.findOne({ slug: req.params.slug })
      .populate("category")
      .populate("subcategory");

    if (!company) return res.status(404).json({ error: "Company not found" });

    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add this route
router.get("/:companyId/reviews/display", getCompanyReviewsForDisplay);

module.exports = router;
