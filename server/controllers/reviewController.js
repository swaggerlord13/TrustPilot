// Escapes user search text so it is matched literally
const { escapeRegex } = require("../utils/brands");
// Plain-text query values only
const { asText } = require("../utils/input");
// Add this to your reviewRoutes.js or create a new controller

const Review = require("../models/Review");
// Logs unexpected errors and answers without leaking internal details
const { sendServerError } = require("../utils/http");

/**
 * @route   GET /api/reviews/browse-mixed
 * @desc    Get mixed reviews (randomized good and bad) from different companies
 * @access  Public
 */
exports.getMixedReviews = async (req, res) => {
  try {
    // Page >= 1 and 1..50 reviews per page, so one request can't ask for everything
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    // Search text, matched literally (plain text only, special characters escaped)
    const searchText = asText(req.query.search, 100);
    const search = searchText ? escapeRegex(searchText) : "";


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

      // Filter by company name if search is provided
      ...(search
        ? [
            {
              $match: {
                "companyData.name": { $regex: search, $options: "i" },
              },
            },
          ]
        : []),

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

      // Join with review replies
      {
        $lookup: {
          from: "reviewreplies",
          localField: "_id",
          foreignField: "review",
          as: "replyData",
        },
      },

      // Add a random field for shuffling
      { $addFields: { randomField: { $rand: {} } } },

      // Sort by random field to shuffle results
      { $sort: { randomField: 1 } },

      // Skip and limit for pagination
      { $skip: (page - 1) * limit },
      { $limit: limit },

      // Format the output
      {
        $project: {
          _id: 1,
          title: { $ifNull: ["$title", "Review"] },
          comment: 1,
          rating: 1,
          createdAt: 1,
          user: "$userData.name",
          userImage: { $ifNull: ["$userData.profileImage", ""] },
          company: "$companyData.name",
          companySlug: "$companyData.slug",
          companyImage: {
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
          companyUrl: { $ifNull: ["$companyData.url", ""] },
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
          userId: "$userData._id",
          companyReply: {
            $cond: {
              if: { $gt: [{ $size: "$replyData" }, 0] },
              then: { $arrayElemAt: ["$replyData.content", 0] },
              else: null,
            },
          },
          hasReply: { $gt: [{ $size: "$replyData" }, 0] },
        },
      },
    ]);

    // Get total count for pagination (respects search filter)
    const countPipeline = [
      {
        $lookup: {
          from: "companies",
          localField: "company",
          foreignField: "_id",
          as: "companyData",
        },
      },
      { $unwind: "$companyData" },
      ...(search
        ? [
            {
              $match: {
                "companyData.name": { $regex: search, $options: "i" },
              },
            },
          ]
        : []),
      { $count: "total" },
    ];
    const countResult = await Review.aggregate(countPipeline);
    const totalReviews = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalReviews / limit);


    res.json({
      reviews: mixedReviews,
      pagination: {
        currentPage: page,
        totalPages,
        totalReviews,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching mixed reviews:", error);
    sendServerError(res, error);
  }
};
