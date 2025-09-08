const Company = require("../models/Company");
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");
const Review = require("../models/Review");

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
    console.log("🔍 Fetching random 6 categories with top 6 companies each...");

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
      console.log(`🔄 Processing category: ${categoryInfo.categoryName}`);

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
          image:
            item.bestReviewData.user.profileImage ||
            "https://via.placeholder.com/100?text=User",
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
          companyimage:
            item.company.logo ||
            "https://via.placeholder.com/150?text=Company+Logo",
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
    console.error("❌ Error fetching random categories:", error);
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
      logo, // Add this line
      description, // Add this line
      categoryId,
      subcategoryId,
      categoryName,
      subcategoryName,
    } = req.body;

    let finalCategoryId = categoryId;
    let finalSubcategoryId = subcategoryId;

    // If no specific IDs provided, try to find or create "General"
    if (!categoryId && !subcategoryId) {
      // Try to find existing General category
      let generalCategory = await Category.findOne({ name: "General" });

      if (!generalCategory) {
        // Create General category if it doesn't exist
        generalCategory = new Category({
          name: "General",
          slug: "general",
          description: "General category for miscellaneous companies",
        });
        await generalCategory.save();
      }

      // Try to find existing General subcategory
      let generalSubcategory = await SubCategory.findOne({
        name: "General",
        category: generalCategory._id,
      });

      if (!generalSubcategory) {
        // Create General subcategory if it doesn't exist
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
      name,
      url,
      logo, // Add this line
      description, // Add this line
      category: finalCategoryId,
      subcategory: finalSubcategoryId,
    });

    const savedCompany = await company.save();

    // Populate the saved company before sending response
    const populatedCompany = await Company.findById(savedCompany._id)
      .populate("category", "name slug")
      .populate("subcategory", "name slug");

    res.status(201).json(populatedCompany);
  } catch (error) {
    console.error("Create company error:", error);
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update company (move between category/subcategory)
// @route   PUT /api/companies/:id
exports.updateCompany = async (req, res) => {
  try {
    const { name, url, logo, description, categoryId, subcategoryId } =
      req.body;

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    if (name) company.name = name;
    if (url) company.url = url;
    if (logo) company.logo = logo; // Add this line
    if (description) company.description = description; // Add this line
    if (categoryId) company.category = categoryId;
    if (subcategoryId) company.subcategory = subcategoryId;

    await company.save();
    res.json(company);
  } catch (error) {
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
    console.log("🔍 Fetching 25 latest best reviews from top companies...");

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
          image: {
            $ifNull: [
              "$userData.profileImage",
              "https://via.placeholder.com/100?text=User",
            ],
          },
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
                  "https://via.placeholder.com/150?text=Company+Logo",
                ],
              },
            ],
          },
          category: "$categoryData.name",
          createdAt: 1,
        },
      },
    ]);

    console.log(`✅ Found ${latestBestReviews.length} latest best reviews`);

    res.json({
      reviews: latestBestReviews,
      total: latestBestReviews.length,
    });
  } catch (error) {
    console.error("❌ Error fetching latest best reviews:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};
// Get random reviews for a specific company
exports.getRandomCompanyReviews = async (req, res) => {
  try {
    const { companyId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    const reviews = await Review.aggregate([
      { $match: { company: mongoose.Types.ObjectId(companyId) } },
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

    // First get all reviews to calculate average rating
    const allReviews = await Review.find({ company: companyId });

    if (allReviews.length === 0) {
      return res.json([]);
    }

    // Calculate average rating
    const avgRating =
      allReviews.reduce((sum, review) => sum + review.rating, 0) /
      allReviews.length;
    const roundedAvgRating = Math.round(avgRating);

    console.log(
      `Company average rating: ${avgRating}, rounded: ${roundedAvgRating}`
    );

    // Smart selection strategy based on company's performance
    let selectedReviews = [];

    if (roundedAvgRating >= 4) {
      // High-performing company: Show mostly 4-5 star reviews
      const excellent = allReviews.filter((r) => r.rating === 5).slice(0, 6);
      const good = allReviews.filter((r) => r.rating === 4).slice(0, 3);
      const average = allReviews.filter((r) => r.rating === 3).slice(0, 1);
      selectedReviews = [...excellent, ...good, ...average];
    } else if (roundedAvgRating === 3) {
      // Average company: Show balanced mix
      const excellent = allReviews.filter((r) => r.rating === 5).slice(0, 2);
      const good = allReviews.filter((r) => r.rating === 4).slice(0, 3);
      const average = allReviews.filter((r) => r.rating === 3).slice(0, 3);
      const poor = allReviews.filter((r) => r.rating === 2).slice(0, 2);
      selectedReviews = [...excellent, ...good, ...average, ...poor];
    } else {
      // Low-performing company: Show honest representation but not overwhelming negativity
      const excellent = allReviews.filter((r) => r.rating === 5).slice(0, 1);
      const good = allReviews.filter((r) => r.rating === 4).slice(0, 2);
      const average = allReviews.filter((r) => r.rating === 3).slice(0, 3);
      const poor = allReviews.filter((r) => r.rating === 2).slice(0, 2);
      const bad = allReviews.filter((r) => r.rating === 1).slice(0, 2);
      selectedReviews = [...excellent, ...good, ...average, ...poor, ...bad];
    }

    // Shuffle the selected reviews to avoid pattern recognition
    selectedReviews = selectedReviews
      .sort(() => 0.5 - Math.random())
      .slice(0, 10);

    // Populate the selected reviews with user and company data
    const reviewIds = selectedReviews.map((r) => r._id);

    const populatedReviews = await Review.find({ _id: { $in: reviewIds } })
      .populate("user", "name profileImage")
      .populate({
        path: "company",
        select: "name slug url logo category",
        populate: {
          path: "category",
          select: "name slug",
        },
      })
      .sort({ createdAt: -1 });

    res.json(populatedReviews);
  } catch (error) {
    console.error("Error fetching company display reviews:", error);
    res.status(500).json({ message: error.message });
  }
};
