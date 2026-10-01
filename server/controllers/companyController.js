const mongoose = require("mongoose");
const Company = require("../models/Company");
const Category = require("../models/Category");
const SubCategory = require("../models/Subcategory");
const Review = require("../models/Review");
const AFRICAN_CITIES = require("../data/africanCities");

// ... keep all your existing functions ...

// NEW: Get company with pre-calculated ratings (for company page)
exports.getCompanyWithRatings = async (req, res) => {
  try {
    const { slug } = req.params;

    // Find company by slug
    const company = await Company.findOne({ slug })
      .populate("category", "name slug")
      .populate("subcategory", "name slug");

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Get review statistics using MongoDB aggregation
    const reviewStats = await Review.aggregate([
      { $match: { company: company._id } },
      {
        $group: {
          _id: "$company",
          avgRating: { $avg: "$rating" },
          reviewCount: { $sum: 1 },
          ratingBreakdown: {
            $push: "$rating",
          },
        },
      },
    ]);

    let stats = {
      avgRating: 0,
      reviewCount: 0,
      ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };

    if (reviewStats.length > 0) {
      const stat = reviewStats[0];
      stats.avgRating = Math.round(stat.avgRating * 10) / 10; // Round to 1 decimal
      stats.reviewCount = stat.reviewCount;

      // Calculate rating breakdown
      stat.ratingBreakdown.forEach((rating) => {
        stats.ratingBreakdown[rating]++;
      });
    }

    res.json({
      company,
      ...stats,
    });
  } catch (error) {
    console.error("Error fetching company with ratings:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};

// NEW: Get best companies by category (for homepage)
// Replace getBestCompaniesByCategory function in companyController.js

exports.getBestCompaniesByCategory = async (req, res) => {
  try {

    // Get all categories that have companies with reviews, then randomize
    const categoriesWithCompanies = await Review.aggregate([
      // Join with companies
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "companyData",
        },
      },
      { $unwind: "$companyData" },

      // Join with categories
      {
        $lookup: {
          from: "categories",
          localField: "companyData.category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      { $unwind: "$categoryData" },

      // Group by category to get unique categories
      {
        $group: {
          _id: "$categoryData._id",
          categoryName: { $first: "$categoryData.name" },
          categorySlug: { $first: "$categoryData.slug" },
          companyCount: { $addToSet: "$companyData._id" },
        },
      },

      // Only categories with companies that have reviews
      { $match: { companyCount: { $exists: true } } },

      // Randomize the categories using $sample
      { $sample: { size: 6 } },
    ]);

    console.log(
      "📊 Random categories selected:",
      categoriesWithCompanies.map((cat) => cat.categoryName)
    );

    const categoryResults = [];

    for (const categoryInfo of categoriesWithCompanies) {

      // Get top 6 companies in this specific category (changed from 25 to 6)
      const topCompanies = await Review.aggregate([
        // Join with companies to filter by category
        {
          $lookup: {
            from: "companies",
            localField: "company",
            foreignField: "_id",
            as: "companyData",
          },
        },
        { $unwind: "$companyData" },

        // Filter by this specific category
        { $match: { "companyData.category": categoryInfo._id } },

        // Group by company and calculate stats
        {
          $group: {
            _id: "$company",
            avgRating: { $avg: "$rating" },
            reviewCount: { $sum: 1 },
            company: { $first: "$companyData" },
          },
        },

        // Only companies with reviews
        { $match: { reviewCount: { $gt: 0 } } },

        // Sort by rating then review count
        { $sort: { avgRating: -1, reviewCount: -1 } },

        // Limit to top 6 companies per category
        { $limit: 4 },

        // Lookup best review (highest rated, most recent)
        {
          $lookup: {
            from: "reviews",
            let: { companyId: "$_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$company", "$$companyId"] } } },
              { $sort: { rating: -1, createdAt: -1 } },
              { $limit: 1 },
              {
                $lookup: {
                  from: "users",
                  localField: "user",
                  foreignField: "_id",
                  as: "user",
                },
              },
              { $unwind: "$user" },
            ],
            as: "bestReviewData",
          },
        },
        { $unwind: "$bestReviewData" },
      ]);

      if (topCompanies.length > 0) {
        console.log(
          `✅ ${categoryInfo.categoryName}: Found ${topCompanies.length} companies`
        );

        // Format the response
        const formattedCompanies = topCompanies.map((item, index) => ({
          _id: item.bestReviewData._id,
          title: item.bestReviewData.title || "Review",
          comment: item.bestReviewData.comment,
          rating: item.bestReviewData.rating,
          user: item.bestReviewData.user.name || "Anonymous",
          image: item.bestReviewData.user.profileImage || "",
          date: new Date(item.bestReviewData.createdAt).toLocaleDateString(
            "en-US",
            {
              year: "numeric",
              month: "long",
              day: "numeric",
            }
          ),
          company: item.company.name,
          companyId: item.company._id,
          companySlug: item.company.slug,
          url: `/company/${item.company.slug}`,
          companyimage: item.company.logo || "",
          companyUrl: item.company.url || "",
          category: categoryInfo.categoryName,
          avgRating: Math.round(item.avgRating * 10) / 10,
          reviewCount: item.reviewCount,
          ranking: index + 1,
          createdAt: item.bestReviewData.createdAt,
        }));

        categoryResults.push({
          category: {
            name: categoryInfo.categoryName,
            slug: categoryInfo.categorySlug,
            totalCompanies: topCompanies.length,
          },
          companies: formattedCompanies,
        });
      }
    }

    console.log(
      `🎉 Returning ${categoryResults.length} random categories with top 6 companies each`
    );

    res.json({
      categories: categoryResults,
    });
  } catch (error) {
    console.error("Error fetching random categories:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};
// @desc    Get companies
// @route   GET /api/companies?subcategoryId=123&categoryId=456
// @access  Public (frontend calls this when loading companies)
exports.getCompanies = async (req, res) => {
  try {
    const { subcategoryId, categoryId } = req.query;

    // Build filter dynamically
    let filter = {};
    if (subcategoryId) filter.subcategory = subcategoryId;
    if (categoryId) filter.category = categoryId;

    const companies = await Company.find(filter)
      .populate("category", "name")
      .populate("subcategory", "name");

    res.json(companies);
  } catch (error) {
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};

// @desc    Create a new company
// @route   POST /api/companies
exports.createCompany = async (req, res) => {
  try {
    const {
      name,
      url,
      logo,
      description,
      categoryId,
      subcategoryId,
      categoryName,
      subcategoryName,
      city,
      country,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Company name is required." });
    }

    // ── Duplicate check (Trustpilot-style) ──
    const duplicates = await Company.checkDuplicate(
      name.trim(),
      city ? city.trim() : null,
      country ? country.trim() : null,
      url ? url.trim() : null
    );

    if (duplicates) {
      return res.status(409).json({
        message: "A similar company already exists.",
        duplicates,
      });
    }

    let finalCategoryId = categoryId;
    let finalSubcategoryId = subcategoryId;

    // If no specific IDs provided, try to find or create "General"
    if (!categoryId && !subcategoryId) {
      let generalCategory = await Category.findOne({ name: "General" });

      if (!generalCategory) {
        generalCategory = new Category({
          name: "General",
          slug: "general",
          description: "General category for miscellaneous companies",
        });
        await generalCategory.save();
      }

      let generalSubcategory = await SubCategory.findOne({
        name: "General",
        category: generalCategory._id,
      });

      if (!generalSubcategory) {
        generalSubcategory = new SubCategory({
          name: "General",
          slug: "general",
          category: generalCategory._id,
          description: "General subcategory",
        });
        await generalSubcategory.save();
      }

      finalCategoryId = generalCategory._id;
      finalSubcategoryId = generalSubcategory._id;
    }

    const company = new Company({
      name: name.trim(),
      url: url ? url.trim() : undefined,
      logo,
      description,
      category: finalCategoryId,
      subcategory: finalSubcategoryId,
      city: city ? city.trim() : undefined,
      country: country ? country.trim() : undefined,
    });

    const savedCompany = await company.save();

    const populatedCompany = await Company.findById(savedCompany._id)
      .populate("category", "name slug")
      .populate("subcategory", "name slug");

    res.status(201).json(populatedCompany);
  } catch (error) {
    console.error("Create company error:", error);
    // Handle MongoDB duplicate key error from compound index
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A company with this name already exists in this city and country.",
      });
    }
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update company (move between category/subcategory)
// @route   PUT /api/companies/:id
exports.updateCompany = async (req, res) => {
  try {
    const { name, url, logo, description, categoryId, subcategoryId, city, country } =
      req.body;

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // If name, city, or country are changing, check for duplicates
    const newName = name || company.name;
    const newCity = city !== undefined ? city : company.city;
    const newCountry = country !== undefined ? country : company.country;
    const newUrl = url !== undefined ? url : company.url;

    if (name || city !== undefined || country !== undefined || url !== undefined) {
      const duplicates = await Company.checkDuplicate(
        newName.trim(),
        newCity ? newCity.trim() : null,
        newCountry ? newCountry.trim() : null,
        newUrl ? newUrl.trim() : null,
        company._id // exclude current company
      );

      if (duplicates) {
        return res.status(409).json({
          message: "A similar company already exists.",
          duplicates,
        });
      }
    }

    if (name) company.name = name.trim();
    if (url !== undefined) company.url = url ? url.trim() : url;
    if (logo) company.logo = logo;
    if (description) company.description = description;
    if (categoryId) company.category = categoryId;
    if (subcategoryId) company.subcategory = subcategoryId;
    if (city !== undefined) company.city = city ? city.trim() : city;
    if (country !== undefined) company.country = country ? country.trim() : country;

    await company.save();
    res.json(company);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A company with this name already exists in this city and country.",
      });
    }
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete company
// @route   DELETE /api/companies/:id
exports.deleteCompany = async (req, res) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    res.json({ message: "Company deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// controllers/companyController.js
exports.getCompaniesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const companies = await Company.find({ category: categoryId })
      .populate("category")
      .populate("subcategory");

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCompaniesBySubcategory = async (req, res) => {
  try {
    const { subcategoryId } = req.params;

    const companies = await Company.find({ subcategory: subcategoryId })
      .populate("category")
      .populate("subcategory");

    res.json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add this new function to companyController.js

exports.getLatestBestReviews = async (req, res) => {
  try {

    // Get the latest 25 reviews from companies with good ratings (3+ stars)
    const latestBestReviews = await Review.aggregate([
      // Only include reviews with rating 3 or higher
      { $match: { rating: { $gte: 3 } } },

      // Join with companies
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "companyData",
        },
      },
      { $unwind: "$companyData" },

      // Join with categories
      {
        $lookup: {
          from: "categories",
          localField: "companyData.category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      { $unwind: "$categoryData" },

      // Join with users
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userData",
        },
      },
      { $unwind: "$userData" },

      // Sort by creation date (newest first)
      { $sort: { createdAt: -1 } },

      // Limit to 25 reviews
      { $limit: 25 },

      // Format the output
      {
        $project: {
          _id: 1,
          title: { $ifNull: ["$title", "Review"] },
          comment: 1,
          rating: 1,
          user: "$userData.name",
          image: { $ifNull: ["$userData.profileImage", ""] },
          date: {
            $dateToString: {
              format: "%B %d, %Y",
              date: "$createdAt",
            },
          },
          company: "$companyData.name",
          companySlug: "$companyData.slug",
          url: {
            $concat: ["/company/", "$companyData.slug"],
          },
          companyimage: {
            $ifNull: [
              "$companyData.logo",
              {
                $ifNull: [
                  "$companyData.companyImage",
                  "",
                ],
              },
            ],
          },
          category: "$categoryData.name",
          companyUrl: "$companyData.url",
          createdAt: 1,
        },
      },
    ]);


    res.json({
      reviews: latestBestReviews,
      total: latestBestReviews.length,
    });
  } catch (error) {
    console.error("Error fetching latest best reviews:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};
// Get random reviews for a specific company
exports.getRandomCompanyReviews = async (req, res) => {
  try {
    const { companyId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const reviews = await Review.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId) } },
      { $sample: { size: limit } }, // Random sampling
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "company",
        },
      },
      { $unwind: "$company" },
      {
        $lookup: {
          from: "categories",
          localField: "company.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
    ]);

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Get smartly selected reviews for display on company page
exports.getCompanyReviewsForDisplay = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get average rating using a lightweight aggregation (no full load)
    const [stats] = await Review.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId) } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          total: { $sum: 1 },
        },
      },
    ]);

    if (!stats || stats.total === 0) {
      return res.json([]);
    }

    const roundedAvgRating = Math.round(stats.avgRating);

    // Build targeted per-rating queries based on company performance
    // instead of loading every review into memory
    let ratingLimits;
    if (roundedAvgRating >= 4) {
      ratingLimits = { 5: 6, 4: 3, 3: 1 };
    } else if (roundedAvgRating === 3) {
      ratingLimits = { 5: 2, 4: 3, 3: 3, 2: 2 };
    } else {
      ratingLimits = { 5: 1, 4: 2, 3: 3, 2: 2, 1: 2 };
    }

    // Fetch only the reviews we need, per rating level
    const queryPromises = Object.entries(ratingLimits).map(([rating, limit]) =>
      Review.find({ company: companyId, rating: parseInt(rating) })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("_id")
        .lean()
    );
    const perRating = await Promise.all(queryPromises);
    const reviewIds = perRating.flat().map((r) => r._id);

    if (reviewIds.length === 0) {
      return res.json([]);
    }

    // Use MongoDB $sample for random ordering instead of JS Math.random
    const populatedReviews = await Review.aggregate([
      { $match: { _id: { $in: reviewIds } } },
      { $sample: { size: 10 } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { name: 1, profileImage: 1 } }],
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "company",
          pipeline: [
            { $project: { name: 1, slug: 1, url: 1, logo: 1, category: 1 } },
            {
              $lookup: {
                from: "categories",
                localField: "category",
                foreignField: "_id",
                as: "category",
                pipeline: [{ $project: { name: 1, slug: 1 } }],
              },
            },
            { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
          ],
        },
      },
      { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
    ]);

    res.json(populatedReviews);
  } catch (error) {
    console.error("Error fetching company display reviews:", error);
    res.status(500).json({ message: error.message });
  }
};

// Search companies with filters (for Browse Companies page)
exports.searchCompanies = async (req, res) => {
  try {
    const {
      q = "",
      city,
      country,
      category,
      minRating,
      sort = "relevance",
      page = 1,
      limit = 20,
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // ──────────────────────────────────────────────
    // Smart query parsing: detect location words in the search text
    // e.g. "restaurant in lagos" → keyword="restaurant", detectedCity="Lagos"
    // e.g. "lagos" → keyword="", detectedCity="Lagos"
    // ──────────────────────────────────────────────
    let keywordPart = q.trim();
    let detectedCity = null;
    let detectedCountry = null;

    if (keywordPart) {
      // Get known cities and countries from DB + predefined African list
      const [dbCities, dbCountries] = await Promise.all([
        Company.distinct("city", { city: { $ne: null, $ne: "" } }),
        Company.distinct("country", { country: { $ne: null, $ne: "" } }),
      ]);
      const predefinedCountries = Object.keys(AFRICAN_CITIES);
      const predefinedCities = Object.values(AFRICAN_CITIES).flat();
      const knownCities = [...new Set([...dbCities, ...predefinedCities])];
      const knownCountries = [...new Set([...dbCountries, ...predefinedCountries])];

      // Normalize for matching
      const lowerQuery = keywordPart.toLowerCase();
      // Remove filler words like "in", "at", "near", "from"
      const cleanedQuery = lowerQuery.replace(/\b(in|at|near|from|around)\b/g, " ").replace(/\s+/g, " ").trim();

      // Check if any known country name appears in the query
      for (const c of knownCountries) {
        if (cleanedQuery.includes(c.toLowerCase())) {
          detectedCountry = c;
          // Remove the country name from the keyword part
          keywordPart = keywordPart.replace(new RegExp(c, "i"), "").replace(/\b(in|at|near|from|around)\b/gi, " ").replace(/\s+/g, " ").trim();
          break;
        }
      }

      // Check if any known city name appears in the query
      for (const c of knownCities) {
        if (cleanedQuery.includes(c.toLowerCase())) {
          detectedCity = c;
          // Remove the city name from the keyword part
          keywordPart = keywordPart.replace(new RegExp(c, "i"), "").replace(/\b(in|at|near|from|around)\b/gi, " ").replace(/\s+/g, " ").trim();
          break;
        }
      }
    }

    // Use explicit filter params first, fall back to detected values from query
    const effectiveCity = city || detectedCity;
    const effectiveCountry = country || detectedCountry;
    const searchRegex = keywordPart ? new RegExp(keywordPart, "i") : null;

    // Step 1: Build the company match filter
    const companyMatch = {};

    if (searchRegex) {
      companyMatch.$or = [
        { name: searchRegex },
        { description: searchRegex },
      ];
    }
    if (effectiveCity) companyMatch.city = new RegExp(effectiveCity, "i");
    if (effectiveCountry) companyMatch.country = new RegExp(effectiveCountry, "i");

    // Step 2: If category filter is set, find the category ID
    if (category) {
      const cat = await Category.findOne({
        $or: [
          { slug: category },
          { name: new RegExp(category, "i") },
        ],
      });
      if (cat) companyMatch.category = cat._id;
    }

    // Step 3: Also search review text, category names, and subcategory names for the query
    let companyIdsFromReviews = [];
    let companyIdsFromCategories = [];

    if (searchRegex) {
      // Find companies mentioned in reviews matching the search
      const reviewMatches = await Review.distinct("company", {
        $or: [
          { comment: searchRegex },
          { title: searchRegex },
        ],
      });
      companyIdsFromReviews = reviewMatches;

      // Find companies in categories OR subcategories matching the search
      const [categoryMatches, subCategoryMatches] = await Promise.all([
        Category.find({ name: searchRegex }),
        SubCategory.find({ name: searchRegex }),
      ]);

      const catIds = categoryMatches.map((c) => c._id);
      const subCatIds = subCategoryMatches.map((s) => s._id);

      if (catIds.length > 0 || subCatIds.length > 0) {
        const matchConditions = [];
        if (catIds.length > 0) matchConditions.push({ category: { $in: catIds } });
        if (subCatIds.length > 0) matchConditions.push({ subcategory: { $in: subCatIds } });

        const companiesInCats = await Company.distinct("_id", {
          $or: matchConditions,
        });
        companyIdsFromCategories = companiesInCats;
      }

      // Merge: company matches name/desc OR has matching reviews OR is in matching category/subcategory
      if (companyMatch.$or) {
        companyMatch.$or.push(
          { _id: { $in: [...companyIdsFromReviews, ...companyIdsFromCategories] } }
        );
      }
    }

    // Step 4: Get companies with review stats using aggregation
    const pipeline = [
      { $match: companyMatch },
      // Get review stats
      {
        $lookup: {
          from: "reviews",
          localField: "_id",
          foreignField: "company",
          as: "reviews",
        },
      },
      // Get category info
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData",
        },
      },
      {
        $addFields: {
          avgRating: {
            $cond: {
              if: { $gt: [{ $size: "$reviews" }, 0] },
              then: { $round: [{ $avg: "$reviews.rating" }, 1] },
              else: 0,
            },
          },
          reviewCount: { $size: "$reviews" },
          categoryName: { $arrayElemAt: ["$categoryData.name", 0] },
          categorySlug: { $arrayElemAt: ["$categoryData.slug", 0] },
        },
      },
    ];

    // Step 5: Filter by minimum rating if set
    if (minRating) {
      pipeline.push({
        $match: { avgRating: { $gte: parseFloat(minRating) } },
      });
    }

    // Step 6: Sort
    if (sort === "rating") {
      pipeline.push({ $sort: { avgRating: -1, reviewCount: -1 } });
    } else if (sort === "reviews") {
      pipeline.push({ $sort: { reviewCount: -1, avgRating: -1 } });
    } else if (sort === "newest") {
      pipeline.push({ $sort: { createdAt: -1 } });
    } else if (sort === "name") {
      pipeline.push({ $sort: { name: 1 } });
    } else {
      // relevance: prioritize review count and rating
      pipeline.push({ $sort: { reviewCount: -1, avgRating: -1 } });
    }

    // Get total count before pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Company.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Step 7: Paginate and project
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(limit) });
    pipeline.push({
      $project: {
        _id: 1,
        name: 1,
        slug: 1,
        url: 1,
        description: 1,
        logo: 1,
        city: 1,
        country: 1,
        address: 1,
        avgRating: 1,
        reviewCount: 1,
        categoryName: 1,
        categorySlug: 1,
        createdAt: 1,
      },
    });

    const companies = await Company.aggregate(pipeline);

    res.json({
      companies,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error searching companies:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};

// Get distinct cities and countries for filter dropdowns
exports.getCompanyLocations = async (req, res) => {
  try {
    // Get city-country pairs from actual companies in the database
    const pairs = await Company.aggregate([
      { $match: { city: { $ne: null, $ne: "" }, country: { $ne: null, $ne: "" } } },
      { $group: { _id: { city: "$city", country: "$country" } } },
      { $sort: { "_id.city": 1 } },
    ]);

    // Start with the full predefined list of African cities
    const countryToCities = {};
    const allCities = new Set();
    const allCountries = new Set();

    // Load predefined cities for every African country
    for (const [country, cities] of Object.entries(AFRICAN_CITIES)) {
      allCountries.add(country);
      countryToCities[country] = [...cities];
      cities.forEach((city) => allCities.add(city));
    }

    // Merge in any database cities that aren't in the predefined list
    pairs.forEach((p) => {
      const c = p._id.country;
      const city = p._id.city;
      allCities.add(city);
      allCountries.add(c);
      if (!countryToCities[c]) countryToCities[c] = [];
      if (!countryToCities[c].includes(city)) countryToCities[c].push(city);
    });

    // Sort cities inside each country
    Object.keys(countryToCities).forEach((c) => countryToCities[c].sort());

    res.json({
      cities: [...allCities].sort(),
      countries: [...allCountries].sort(),
      countryToCities,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
