const express = require("express");
const router = express.Router();
const Company = require("../models/Company");
const Category = require("../models/Category");
const Subcategory = require("../models/Subcategory");
const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");

// ============================================================
// Google Places → TrustPilot.Africa category mapping
// Maps common Google Place types to our category names
// ============================================================
const GOOGLE_TYPE_TO_CATEGORY = {
  // Animals & Pets
  pet_store: "Animals & Pets",
  veterinary_care: "Animals & Pets",
  zoo: "Animals & Pets",

  // Beauty & Well-being
  beauty_salon: "Beauty & Well-being",
  hair_care: "Beauty & Well-being",
  spa: "Beauty & Well-being",

  // Business Services
  accounting: "Business Services",
  lawyer: "Legal Services & Government",
  real_estate_agency: "Real Estate & Property",

  // Construction & Manufacturing
  general_contractor: "Construction & Manufacturing",
  electrician: "Construction & Manufacturing",
  plumber: "Construction & Manufacturing",

  // Education & Training
  school: "Education & Training",
  university: "Education & Training",
  library: "Education & Training",

  // Electronics & Technology
  electronics_store: "Electronics & Technology",
  computer_store: "Electronics & Technology",

  // Events & Entertainment
  amusement_park: "Events & Entertainment",
  movie_theater: "Events & Entertainment",
  night_club: "Events & Entertainment",
  casino: "Events & Entertainment",

  // Food, Beverages & Tobacco
  bakery: "Food, Beverages & Tobacco",
  grocery_or_supermarket: "Food, Beverages & Tobacco",
  supermarket: "Food, Beverages & Tobacco",
  liquor_store: "Food, Beverages & Tobacco",

  // Health & Medical
  hospital: "Health & Medical",
  doctor: "Health & Medical",
  dentist: "Health & Medical",
  pharmacy: "Health & Medical",
  physiotherapist: "Health & Medical",

  // Home & Garden
  home_goods_store: "Home & Garden",
  furniture_store: "Home & Garden",
  hardware_store: "Home & Garden",

  // Home Services
  locksmith: "Home Services",
  moving_company: "Home Services",
  painter: "Home Services",
  roofing_contractor: "Home Services",

  // Legal Services & Government
  courthouse: "Legal Services & Government",
  city_hall: "Legal Services & Government",
  local_government_office: "Legal Services & Government",

  // Money & Insurance
  bank: "Money & Insurance",
  atm: "Money & Insurance",
  insurance_agency: "Money & Insurance",
  finance: "Money & Insurance",

  // Restaurants & Bars
  restaurant: "Restaurants & Bars",
  bar: "Restaurants & Bars",
  cafe: "Restaurants & Bars",
  meal_delivery: "Restaurants & Bars",
  meal_takeaway: "Restaurants & Bars",

  // Shopping & Fashion
  clothing_store: "Shopping & Fashion",
  shoe_store: "Shopping & Fashion",
  shopping_mall: "Shopping & Fashion",
  department_store: "Shopping & Fashion",
  jewelry_store: "Shopping & Fashion",

  // Sports
  gym: "Sports",
  stadium: "Sports",

  // Travel & Vacation
  travel_agency: "Travel & Vacation",
  lodging: "Travel & Vacation",
  hotel: "Travel & Vacation",

  // Utilities
  gas_station: "Utilities",

  // Vehicles & Transportation
  car_dealer: "Vehicles & Transportation",
  car_rental: "Vehicles & Transportation",
  car_repair: "Vehicles & Transportation",
  car_wash: "Vehicles & Transportation",

  // Fintech & Mobile Money
  // (no direct Google type — matched by keyword in name)

  // Telecommunications
  // (no direct Google type — matched by keyword in name)

  // Logistics & Delivery
  post_office: "Logistics & Delivery",
  transit_station: "Logistics & Delivery",

  // Agriculture & Agritech
  // (no direct Google type — matched by keyword)
};

// Keyword-based fallback for companies Google doesn't categorize well
const KEYWORD_TO_CATEGORY = {
  "telecom": "Telecommunications",
  "mobile money": "Fintech & Mobile Money",
  "fintech": "Fintech & Mobile Money",
  "mpesa": "Fintech & Mobile Money",
  "m-pesa": "Fintech & Mobile Money",
  "airtel money": "Fintech & Mobile Money",
  "mtn money": "Fintech & Mobile Money",
  "logistics": "Logistics & Delivery",
  "delivery": "Logistics & Delivery",
  "courier": "Logistics & Delivery",
  "farming": "Agriculture & Agritech",
  "agri": "Agriculture & Agritech",
  "real estate": "Real Estate & Property",
  "property": "Real Estate & Property",
};

/**
 * Figure out which of our categories a Google Place belongs to
 */
function mapGoogleToCategory(googleTypes = [], placeName = "") {
  // 1. Try direct type mapping
  for (const type of googleTypes) {
    if (GOOGLE_TYPE_TO_CATEGORY[type]) {
      return GOOGLE_TYPE_TO_CATEGORY[type];
    }
  }

  // 2. Try keyword matching on the business name
  const lowerName = placeName.toLowerCase();
  for (const [keyword, category] of Object.entries(KEYWORD_TO_CATEGORY)) {
    if (lowerName.includes(keyword)) {
      return category;
    }
  }

  // 3. Default to Business Services
  return "Business Services";
}

/**
 * Extract city and country from address components
 */
function extractLocation(addressComponents = []) {
  let city = "";
  let country = "";

  for (const comp of addressComponents) {
    if (comp.types.includes("locality")) {
      city = comp.long_name;
    }
    if (comp.types.includes("country")) {
      country = comp.long_name;
    }
  }

  return { city, country };
}

// ============================================================
// ROUTES
// ============================================================

/**
 * POST /api/google/search
 * Search Google Places for businesses in Africa
 * Body: { query, country }
 * Example: { query: "banks in Lagos", country: "Nigeria" }
 */
router.post("/search", protect, admin, async (req, res) => {
  try {
    const { query, country } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Google API key not configured" });

    const searchQuery = country ? `${query} in ${country}` : query;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return res.status(400).json({ error: `Google API error: ${data.status}`, details: data.error_message });
    }

    // Return simplified results
    const results = data.results.map((place) => ({
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address,
      rating: place.rating || null,
      reviewCount: place.user_ratings_total || 0,
      types: place.types,
      suggestedCategory: mapGoogleToCategory(place.types, place.name),
    }));

    res.json({ results, count: results.length });
  } catch (err) {
    console.error("Google search error:", err);
    res.status(500).json({ error: "Failed to search Google Places" });
  }
});

/**
 * POST /api/google/import
 * Import a single company from Google Places into our DB
 * Body: { placeId, categoryOverride? }
 */
router.post("/import", protect, admin, async (req, res) => {
  try {
    const { placeId, categoryOverride } = req.body;
    if (!placeId) return res.status(400).json({ error: "placeId is required" });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Google API key not configured" });

    // Check if already imported
    const existing = await Company.findOne({ googlePlaceId: placeId });
    if (existing) {
      return res.status(409).json({ error: "Company already imported", company: existing });
    }

    // Fetch full details from Google
    const fields = "place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,reviews,photos,types,address_components";
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return res.status(400).json({ error: `Google API error: ${data.status}` });
    }

    const place = data.result;
    const { city, country } = extractLocation(place.address_components || []);

    // Determine category
    const categoryName = categoryOverride || mapGoogleToCategory(place.types, place.name);
    const category = await Category.findOne({ name: categoryName });
    if (!category) {
      return res.status(400).json({ error: `Category "${categoryName}" not found in our DB` });
    }

    // Format Google reviews
    const googleReviews = (place.reviews || []).map((r) => ({
      authorName: r.author_name,
      rating: r.rating,
      text: r.text,
      relativeTimeDescription: r.relative_time_description,
      time: r.time,
      profilePhotoUrl: r.profile_photo_url || "",
    }));

    // Get first photo URL if available
    const googlePhotos = (place.photos || []).slice(0, 3).map(
      (p) => `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${apiKey}`
    );

    // Create company
    const company = new Company({
      name: place.name,
      url: place.website || "",
      description: `${place.name} located at ${place.formatted_address}`,
      category: category._id,
      logo: googlePhotos.length > 0 ? googlePhotos[0] : "",
      googlePlaceId: place.place_id,
      googleRating: place.rating || null,
      googleReviewCount: place.user_ratings_total || 0,
      googleReviews,
      googlePhotos,
      address: place.formatted_address || "",
      phone: place.formatted_phone_number || "",
      country,
      city,
      source: "google",
    });

    await company.save();

    res.status(201).json({ message: "Company imported successfully", company });
  } catch (err) {
    console.error("Google import error:", err);
    res.status(500).json({ error: "Failed to import company" });
  }
});

/**
 * POST /api/google/bulk-import
 * Import multiple companies at once from a Google search
 * Body: { query, country, limit? }
 * Example: { query: "popular restaurants", country: "Nigeria", limit: 10 }
 */
router.post("/bulk-import", protect, admin, async (req, res) => {
  try {
    const { query, country, limit = 10 } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Google API key not configured" });

    const searchQuery = country ? `${query} in ${country}` : query;
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== "OK") {
      return res.status(400).json({ error: `Google API error: ${data.status}` });
    }

    const places = data.results.slice(0, limit);
    const imported = [];
    const skipped = [];

    for (const place of places) {
      // Skip if already exists
      const existing = await Company.findOne({ googlePlaceId: place.place_id });
      if (existing) {
        skipped.push({ name: place.name, reason: "Already imported" });
        continue;
      }

      // Get full details (for reviews)
      const fields = "place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,reviews,photos,types,address_components";
      const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=${fields}&key=${apiKey}`;

      const detailRes = await fetch(detailUrl);
      const detailData = await detailRes.json();

      if (detailData.status !== "OK") {
        skipped.push({ name: place.name, reason: detailData.status });
        continue;
      }

      const detail = detailData.result;
      const { city, country: placeCountry } = extractLocation(detail.address_components || []);
      const categoryName = mapGoogleToCategory(detail.types, detail.name);
      const category = await Category.findOne({ name: categoryName });

      if (!category) {
        skipped.push({ name: detail.name, reason: `Category "${categoryName}" not found` });
        continue;
      }

      const googleReviews = (detail.reviews || []).map((r) => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        relativeTimeDescription: r.relative_time_description,
        time: r.time,
        profilePhotoUrl: r.profile_photo_url || "",
      }));

      const googlePhotos = (detail.photos || []).slice(0, 3).map(
        (p) => `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=${apiKey}`
      );

      try {
        const company = new Company({
          name: detail.name,
          url: detail.website || "",
          description: `${detail.name} located at ${detail.formatted_address}`,
          category: category._id,
          logo: googlePhotos.length > 0 ? googlePhotos[0] : "",
          googlePlaceId: detail.place_id,
          googleRating: detail.rating || null,
          googleReviewCount: detail.user_ratings_total || 0,
          googleReviews,
          googlePhotos,
          address: detail.formatted_address || "",
          phone: detail.formatted_phone_number || "",
          country: placeCountry,
          city,
          source: "google",
        });

        await company.save();
        imported.push({ name: detail.name, category: categoryName, city, country: placeCountry });
      } catch (saveErr) {
        skipped.push({ name: detail.name, reason: saveErr.message });
      }
    }

    res.json({
      message: `Imported ${imported.length} companies, skipped ${skipped.length}`,
      imported,
      skipped,
    });
  } catch (err) {
    console.error("Bulk import error:", err);
    res.status(500).json({ error: "Failed to bulk import" });
  }
});

module.exports = router;
