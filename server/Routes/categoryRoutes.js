// routes/categories.js
const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
const router = express.Router();
const Category = require("../models/Category");
const SubCategory = require("../models/Subcategory");
const Company = require("../models/Company");
const {
  getCategoryCompaniesWithPagination,
} = require("../controllers/categoryController");

// ✅ Get all categories with their subcategories
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find().lean();

    // Fetch ALL subcategories in one query, then group by category
    const allSubcategories = await SubCategory.find().lean();
    const subsByCategory = {};
    for (const sub of allSubcategories) {
      const catId = sub.category.toString();
      if (!subsByCategory[catId]) subsByCategory[catId] = [];
      subsByCategory[catId].push(sub);
    }

    const categoriesWithSubs = categories.map((cat) => ({
      ...cat,
      subcategories: subsByCategory[cat._id.toString()] || [],
    }));

    res.json(categoriesWithSubs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Create category
router.post("/", protect, admin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const category = await Category.create({ name });
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete category + cascade delete subcategories + companies
router.delete("/:id", protect, admin, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Find all subcategories under this category
    const subcategories = await SubCategory.find({ category: category._id });

    // Delete all companies under those subcategories
    const subcategoryIds = subcategories.map((sub) => sub._id);
    await Company.deleteMany({ subcategory: { $in: subcategoryIds } });

    // Delete the subcategories
    await SubCategory.deleteMany({ category: category._id });

    // Finally delete the category
    await Category.findByIdAndDelete(req.params.id);

    res.json({
      message:
        "Category, its subcategories, and all related companies deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:slug/companies-paginated", getCategoryCompaniesWithPagination);

// ✅ Get companies under a category by slug
router.get("/:slug/companies", async (req, res) => {
  try {
    const category = await Category.findOne({ slug: req.params.slug });
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    const companies = await Company.find({ category: category._id }).lean();
    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
