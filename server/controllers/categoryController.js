const Category = require("../models/Category");
const Review = require("../models/Review");
// Logs unexpected errors and answers without leaking internal details
const { sendServerError } = require("../utils/http");

// Only the paginated category page lives here. Listing, creating, editing
// and deleting categories are handled in Routes/categoryRoutes.js (the delete
// there also removes the category's companies, reviews and claims).

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

    // Get total count before pagination
    const totalCompanies = companiesWithStats.length;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const totalPages = Math.ceil(totalCompanies / limitNum);

    // Apply pagination in JS (needed because $unionWith makes pipeline $skip/$limit unreliable)
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedCompanies = companiesWithStats.slice(startIndex, startIndex + limitNum);

    // Batch-populate category and subcategory info instead of N+1 findById
    const companyIds = paginatedCompanies.map((c) => c._id);
    const SubCat = require("../models/Subcategory");
    const Company = require("../models/Company");

    const [categoryDocs, subcategoryDocs] = await Promise.all([
      Category.find({ _id: { $in: paginatedCompanies.map((c) => c.category).filter(Boolean) } })
        .select("name slug")
        .lean(),
      SubCat.find({ _id: { $in: paginatedCompanies.map((c) => c.subcategory).filter(Boolean) } })
        .select("name slug")
        .lean(),
    ]);

    const catMap = {};
    for (const c of categoryDocs) catMap[c._id.toString()] = c;
    const subMap = {};
    for (const s of subcategoryDocs) subMap[s._id.toString()] = s;

    const populatedCompanies = paginatedCompanies.map((company) => ({
      _id: company._id,
      name: company.name,
      slug: company.slug,
      url: company.url,
      logo: company.logo,
      description: company.description,
      category: company.category ? catMap[company.category.toString()] || null : null,
      subcategory: company.subcategory ? subMap[company.subcategory.toString()] || null : null,
      createdAt: company.createdAt,
      avgRating: Math.round((company.avgRating || 0) * 10) / 10,
      reviewCount: company.reviewCount || 0,
    }));

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
    sendServerError(res, error);
  }
};
