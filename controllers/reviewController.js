// Add this to your reviewRoutes.js or create a new controller

const Review = require("../models/Review");

/**
 * @route   GET /api/reviews/browse-mixed
 * @desc    Get mixed reviews (randomized good and bad) from different companies
 * @access  Public
 */
exports.getMixedReviews = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    console.log("🔍 Fetching mixed reviews for browse page...");

    // Get a mix of reviews using MongoDB aggregation
    const mixedReviews = await Review.aggregate([
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

      // Add a random field for shuffling
      { $addFields: { randomField: { $rand: {} } } },

      // Sort by random field to shuffle results
      { $sort: { randomField: 1 } },

      // Skip and limit for pagination
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },

      // Format the output
      {
        $project: {
          _id: 1,
          title: { $ifNull: ["$title", "Review"] },
          comment: 1,
          rating: 1,
          createdAt: 1,
          user: "$userData.name",
          userImage: {
            $ifNull: [
              "$userData.profileImage",
              "https://via.placeholder.com/100?text=User",
            ],
          },
          company: "$companyData.name",
          companySlug: "$companyData.slug",
          companyImage: {
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
          url: {
            $concat: ["/company/", "$companyData.slug"],
          },
          date: {
            $dateToString: {
              format: "%B %d, %Y",
              date: "$createdAt",
            },
          },
        },
      },
    ]);

    // Get total count for pagination
    const totalReviews = await Review.countDocuments();
    const totalPages = Math.ceil(totalReviews / parseInt(limit));

    console.log(`✅ Found ${mixedReviews.length} mixed reviews`);

    res.json({
      reviews: mixedReviews,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalReviews,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1,
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("❌ Error fetching mixed reviews:", error);
    res.status(500).json({ message: "Server Error: " + error.message });
  }
};
