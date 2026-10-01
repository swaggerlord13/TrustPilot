/**
 * Admin Routes: full CRUD + bulk operations for admin dashboard
 * All routes require authentication + admin privileges
 */
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");

const User = require("../models/User");
const Company = require("../models/Company");
const Review = require("../models/Review");
// Reviews of whole brands (deleted with their author)
const BrandReview = require("../models/BrandReview");
const Category = require("../models/Category");
const SubCategory = require("../models/Subcategory");
const ReviewReply = require("../models/ReviewReply");

// Apply auth + admin to ALL routes in this file
router.use(protect, admin);

// ========================
// DASHBOARD STATS
// ========================

/**
 * GET /api/admin/stats
 * Overview numbers for the dashboard home
 */
router.get("/stats", async (req, res) => {
  try {
    const [totalUsers, totalCompanies, locationReviews, brandReviews, totalCategories] =
      await Promise.all([
        User.countDocuments(),
        Company.countDocuments(),
        Review.countDocuments(),
        // Reviews of whole brands count as reviews too
        BrandReview.countDocuments(),
        Category.countDocuments(),
      ]);
    // All reviews, location and brand
    const totalReviews = locationReviews + brandReviews;

    // Recent activity: last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [newUsers, newLocationReviews, newBrandReviews, newCompanies] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      Review.countDocuments({ createdAt: { $gte: weekAgo } }),
      // New reviews of whole brands this week
      BrandReview.countDocuments({ createdAt: { $gte: weekAgo } }),
      Company.countDocuments({ createdAt: { $gte: weekAgo } }),
    ]);
    // All new reviews this week, location and brand
    const newReviews = newLocationReviews + newBrandReviews;

    res.json({
      totalUsers,
      totalCompanies,
      totalReviews,
      // Split, so the dashboard can show brand reviews separately if needed
      brandReviews,
      totalCategories,
      newUsers,
      newReviews,
      newCompanies,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// USERS
// ========================

/**
 * GET /api/admin/users
 * Paginated list with search
 */
router.get("/users", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const skip = (page - 1) * limit;

    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Admin get users error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/users/:id/toggle-admin
 * Promote or demote a user
 */
router.put("/users/:id/toggle-admin", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    // Don't let admin demote themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: "You cannot change your own admin status" });
    }

    user.isAdmin = !user.isAdmin;
    await user.save();

    res.json({ message: `User ${user.isAdmin ? "promoted to" : "removed from"} admin`, user });
  } catch (err) {
    console.error("Toggle admin error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/users/bulk
 * Delete multiple users and their reviews
 */
router.delete("/users/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }

    // Validate all IDs are valid ObjectIds
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({ error: "One or more invalid user IDs" });
    }

    // Don't allow deleting yourself
    const selfIncluded = validIds.includes(req.user._id.toString());
    if (selfIncluded) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    // Delete users' reviews first
    await Review.deleteMany({ user: { $in: validIds } });
    // ...and their reviews of whole brands
    await BrandReview.deleteMany({ user: { $in: validIds } });
    // Delete the users
    const result = await User.deleteMany({ _id: { $in: validIds } });

    res.json({ message: `${result.deletedCount} user(s) deleted`, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Bulk delete users error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// COMPANIES
// ========================

/**
 * GET /api/admin/companies
 * Paginated list with search and category filter
 */
router.get("/companies", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const categoryId = req.query.categoryId || "";
    const skip = (page - 1) * limit;

    let filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { url: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
        { country: { $regex: search, $options: "i" } },
      ];
    }

    if (categoryId) {
      filter.category = categoryId;
    }

    const [companies, total] = await Promise.all([
      Company.find(filter)
        .populate("category", "name")
        .populate("subcategory", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Company.countDocuments(filter),
    ]);

    res.json({
      companies,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Admin get companies error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/companies/:id
 * Edit any company field
 */
router.put("/companies/:id", async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const allowed = ["name", "url", "description", "logo", "category", "subcategory", "city", "country", "companyImage"];
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) {
        company[field] = req.body[field];
      }
    });

    await company.save(); // triggers pre-save hooks (slug, domain)

    const updated = await Company.findById(company._id)
      .populate("category", "name")
      .populate("subcategory", "name")
      .lean();

    res.json(updated);
  } catch (err) {
    console.error("Admin update company error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/companies/bulk
 * Delete multiple companies and their reviews
 */
router.delete("/companies/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }

    // Validate all IDs are valid ObjectIds
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({ error: "One or more invalid company IDs" });
    }

    // Delete reviews for these companies
    await Review.deleteMany({ company: { $in: validIds } });
    // Delete the companies
    const result = await Company.deleteMany({ _id: { $in: validIds } });

    res.json({ message: `${result.deletedCount} company(ies) deleted`, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Bulk delete companies error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// REVIEWS
// ========================

/**
 * GET /api/admin/reviews
 * Paginated list with search
 */
router.get("/reviews", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || "";
    const rating = req.query.rating || "";
    const skip = (page - 1) * limit;

    let filter = {};

    if (rating) {
      filter.rating = parseInt(rating);
    }

    // For search, we need to do a lookup. Search by company name or user name
    // Using aggregation for cross-collection search
    if (search) {
      // Find matching company IDs
      const matchingCompanies = await Company.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");

      const matchingUsers = await User.find({
        name: { $regex: search, $options: "i" },
      }).select("_id");

      filter.$or = [
        { company: { $in: matchingCompanies.map((c) => c._id) } },
        { user: { $in: matchingUsers.map((u) => u._id) } },
        { title: { $regex: search, $options: "i" } },
        { comment: { $regex: search, $options: "i" } },
      ];
    }

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("user", "name email profileImage")
        .populate("company", "name logo slug url")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);

    res.json({
      reviews,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Admin get reviews error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/reviews/bulk
 * Delete multiple reviews
 */
router.delete("/reviews/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids array is required" });
    }

    // Validate all IDs are valid ObjectIds
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({ error: "One or more invalid review IDs" });
    }

    // Delete any replies to these reviews
    await ReviewReply.deleteMany({ review: { $in: validIds } });
    // Delete the reviews
    const result = await Review.deleteMany({ _id: { $in: validIds } });

    res.json({ message: `${result.deletedCount} review(s) deleted`, deletedCount: result.deletedCount });
  } catch (err) {
    console.error("Bulk delete reviews error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/reviews/:id
 * Delete a single review (admin override, any review)
 */
router.delete("/reviews/:id", async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found" });

    await ReviewReply.deleteMany({ review: review._id });
    await Review.findByIdAndDelete(req.params.id);

    res.json({ message: "Review deleted" });
  } catch (err) {
    console.error("Admin delete review error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// CATEGORIES
// ========================

/**
 * GET /api/admin/categories
 * All categories with subcategory counts and company counts
 */
router.get("/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();

    // Batch: fetch all subcategories and company counts in two queries
    const [allSubcategories, companyCounts] = await Promise.all([
      SubCategory.find().lean(),
      Company.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    // Index subcategories by category
    const subsByCategory = {};
    for (const sub of allSubcategories) {
      const catId = sub.category.toString();
      if (!subsByCategory[catId]) subsByCategory[catId] = [];
      subsByCategory[catId].push(sub);
    }

    // Index company counts by category
    const countByCategory = {};
    for (const item of companyCounts) {
      countByCategory[item._id.toString()] = item.count;
    }

    const enriched = categories.map((cat) => ({
      ...cat,
      subcategories: subsByCategory[cat._id.toString()] || [],
      companyCount: countByCategory[cat._id.toString()] || 0,
    }));

    res.json(enriched);
  } catch (err) {
    console.error("Admin get categories error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/categories/:id
 * Rename a category
 */
router.put("/categories/:id", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    );

    if (!category) return res.status(404).json({ error: "Category not found" });

    res.json(category);
  } catch (err) {
    console.error("Admin update category error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/admin/subcategories/:id
 * Rename a subcategory
 */
router.put("/subcategories/:id", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const subcategory = await SubCategory.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    );

    if (!subcategory) return res.status(404).json({ error: "Subcategory not found" });

    res.json(subcategory);
  } catch (err) {
    console.error("Admin update subcategory error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
