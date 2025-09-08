const Category = require("../models/Category");

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public (frontend will call this to list categories)
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};

// @desc    Create a new category (Admin only later)
// @route   POST /api/categories
exports.createCategory = async (req, res) => {
  try {
    const category = new Category({ name: req.body.name });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add this to categoryController.js

const Review = require("../models/Review");

exports.getCategoryCompaniesWithPagination = async (req, res) => {
  try {
    const { slug } = req.params;
    const { page = 1, limit = 30, search = "", sort = "name" } = req.query;

    console.log(
      `Fetching companies for category: ${slug}, page: ${page}, limit: ${limit}`
    );

    // Find category by slug
    const Category = require("../models/Category");
    const category = await Category.findOne({ slug });
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Build search filter
    let searchFilter = { category: category._id };
    if (search.trim()) {
      searchFilter.name = { $regex: search.trim(), $options: "i" };
    }

    // Get companies with their review stats using aggregation
    const companiesWithStats = await Review.aggregate([
      // First get all reviews
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "companyData",
        },
      },
      { $unwind: "$companyData" },

      // Filter by category and search
      {
        $match: {
          "companyData.category": category._id,
          ...(search.trim() && {
            "companyData.name": { $regex: search.trim(), $options: "i" },
          }),
        },
      },

      // Group by company to calculate stats
      {
        $group: {
          _id: "$companyData._id",
          name: { $first: "$companyData.name" },
          slug: { $first: "$companyData.slug" },
          url: { $first: "$companyData.url" },
          logo: { $first: "$companyData.logo" },
          description: { $first: "$companyData.description" },
          category: { $first: "$companyData.category" },
          subcategory: { $first: "$companyData.subcategory" },
          createdAt: { $first: "$companyData.createdAt" },
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
        },
      },

      // Add companies with no reviews
      {
        $unionWith: {
          coll: "companies",
          pipeline: [
            {
              $match: {
                category: category._id,
                ...(search.trim() && {
                  name: { $regex: search.trim(), $options: "i" },
                }),
                _id: {
                  $nin: await Review.distinct("company", {
                    company: { $exists: true },
                  }).then((ids) => ids),
                },
              },
            },
            {
              $addFields: {
                avgRating: 0,
                reviewCount: 0,
              },
            },
          ],
        },
      },

      // Sort
      {
        $sort:
          sort === "rating"
            ? { avgRating: -1, reviewCount: -1, name: 1 }
            : { name: 1 },
      },
    ]);

    // Manual pagination (since $skip/$limit with $unionWith can be tricky)
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedCompanies = companiesWithStats.slice(startIndex, endIndex);

    // Get total count for pagination info
    const totalCompanies = companiesWithStats.length;
    const totalPages = Math.ceil(totalCompanies / parseInt(limit));

    // Populate category info for companies
    const Company = require("../models/Company");
    const populatedCompanies = await Promise.all(
      paginatedCompanies.map(async (company) => {
        const fullCompany = await Company.findById(company._id)
          .populate("category", "name slug")
          .populate("subcategory", "name slug");

        return {
          ...fullCompany.toObject(),
          avgRating: Math.round((company.avgRating || 0) * 10) / 10,
          reviewCount: company.reviewCount || 0,
        };
      })
    );

    res.json({
      companies: populatedCompanies,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCompanies,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit),
      },
      category: {
        name: category.name,
        slug: category.slug,
      },
    });
  } catch (error) {
    console.error("Error fetching paginated companies:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};
