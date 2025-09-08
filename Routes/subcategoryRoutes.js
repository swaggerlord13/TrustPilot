// routes/subcategories.js
const express = require("express");
const Category = require("../models/Category"); // <-- add this
const SubCategory = require("../models/SubCategory");
const Company = require("../models/Company"); // needed for cascade delete
const { deleteSubcategory } = require("../controllers/subcategoryController");

const router = express.Router();

// ✅ Create a subcategory under a category
router.post("/", async (req, res) => {
  try {
    const { name, categoryId } = req.body;

    if (!name || !categoryId) {
      return res
        .status(400)
        .json({ error: "Name and categoryId are required" });
    }

    const subcategory = await SubCategory.create({
      name,
      category: categoryId,
    });

    res.status(201).json(subcategory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all subcategories (optionally filter by categoryId)
router.get("/", async (req, res) => {
  try {
    const { categoryId } = req.query;

    let filter = {};
    if (categoryId) {
      filter.category = categoryId;
    }

    const subcategories = await SubCategory.find(filter).populate("category");
    res.json(subcategories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Move a subcategory to another category
router.put("/:subCategoryId/move", async (req, res) => {
  try {
    const { newCategoryId } = req.body;

    if (!newCategoryId) {
      return res.status(400).json({ error: "newCategoryId is required" });
    }

    const subcategory = await SubCategory.findByIdAndUpdate(
      req.params.subCategoryId,
      { category: newCategoryId },
      { new: true }
    );

    if (!subcategory) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    res.json(subcategory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete subcategory + cascade delete companies inside it
router.delete("/:id", async (req, res) => {
  try {
    const subcategory = await SubCategory.findById(req.params.id);

    if (!subcategory) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    // Delete companies linked to this subcategory
    await Company.deleteMany({ subcategory: subcategory._id });

    // Delete the subcategory itself
    await SubCategory.findByIdAndDelete(req.params.id);

    res.json({
      message: "Subcategory and related companies deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ===============================
// NEW: Get companies under a subcategory by slug
// ===============================
router.get("/:categorySlug/:subSlug", async (req, res) => {
  try {
    const { categorySlug, subSlug } = req.params;

    // Find category first
    const category = await Category.findOne({ slug: categorySlug });
    if (!category) return res.status(404).json({ error: "Category not found" });

    // Find subcategory under that category by slug
    const subcategory = await SubCategory.findOne({
      slug: subSlug,
      category: category._id,
    });
    if (!subcategory)
      return res.status(404).json({ error: "Subcategory not found" });

    // Get companies under this subcategory
    const companies = await Company.find({ subcategory: subcategory._id });

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
