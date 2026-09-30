/**
 * Seed script — pulls popular African companies from Google Places API
 * and stores them in the DB under the correct category.
 *
 * Usage:
 *   1. Add GOOGLE_PLACES_API_KEY=your_key to server/.env
 *   2. Run: node scripts/seedGoogleCompanies.js
 *
 * Searches for well-known businesses across major African countries,
 * fetches details + up to 5 Google reviews, and saves them.
 * Skips any company already in DB (matched by googlePlaceId or name).
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Company = require("../models/Company");
const Category = require("../models/Category");

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error("ERROR: Set GOOGLE_PLACES_API_KEY in your .env file first.");
  console.error("Get one at https://console.cloud.google.com -> APIs & Services -> Credentials");
  console.error("Enable 'Places API' for the key.");
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;

// Major African countries to seed companies from
const AFRICAN_COUNTRIES = [
  "Nigeria", "South Africa", "Kenya", "Ghana", "Egypt",
  "Tanzania", "Ethiopia", "Rwanda", "Uganda", "Senegal",
  "Cameroon", "Ivory Coast", "Morocco",
];

// [search query fragment, our category name]
const SEARCH_QUERIES = [
  // Telecom — huge in Africa
  ["telecom companies", "Telecommunications"],
  ["mobile network operator", "Telecommunications"],
  ["internet service provider", "Telecommunications"],

  // Fintech & Mobile Money — Africa leads the world
  ["mobile money", "Fintech & Mobile Money"],
  ["fintech company", "Fintech & Mobile Money"],
  ["digital payment", "Fintech & Mobile Money"],

  // Banks & Insurance
  ["popular banks", "Money & Insurance"],
  ["insurance company", "Money & Insurance"],
  ["microfinance bank", "Money & Insurance"],

  // Restaurants & Food
  ["popular restaurants", "Restaurants & Bars"],
  ["fast food", "Restaurants & Bars"],

  // Shopping & Retail
  ["shopping mall", "Shopping & Fashion"],
  ["popular supermarket", "Food, Beverages & Tobacco"],

  // Logistics & Delivery
  ["delivery service", "Logistics & Delivery"],
  ["courier service", "Logistics & Delivery"],
  ["logistics company", "Logistics & Delivery"],

  // Real Estate
  ["real estate company", "Real Estate & Property"],

  // Health
  ["top hospital", "Health & Medical"],
  ["pharmacy chain", "Health & Medical"],

  // Education
  ["top university", "Education & Training"],

  // Travel
  ["airline", "Travel & Vacation"],
  ["hotel", "Travel & Vacation"],

  // Electronics
  ["electronics store", "Electronics & Technology"],

  // Vehicles
  ["car dealership", "Vehicles & Transportation"],

  // Utilities
  ["electricity company", "Utilities"],

  // Agriculture
  ["agricultural company", "Agriculture & Agritech"],
];

// ───────── helpers ─────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractLocation(components = []) {
  let city = "";
  let country = "";
  for (const c of components) {
    if (c.types.includes("locality")) city = c.long_name;
    if (c.types.includes("country")) country = c.long_name;
  }
  return { city, country };
}

async function searchPlaces(query) {
  const url =
    "https://maps.googleapis.com/maps/api/place/textsearch/json?query=" +
    encodeURIComponent(query) +
    "&key=" +
    API_KEY;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn("  Warning: " + query + " -> " + data.status);
  }
  return data.results || [];
}

async function getPlaceDetails(placeId) {
  const fields =
    "place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,reviews,photos,types,address_components";
  const url =
    "https://maps.googleapis.com/maps/api/place/details/json?place_id=" +
    placeId +
    "&fields=" +
    fields +
    "&key=" +
    API_KEY;
  const res = await fetch(url);
  const data = await res.json();
  return data.status === "OK" ? data.result : null;
}

// ───────── main ─────────

async function main() {
  console.log("TrustPilot.Africa - Google Places Seed Script");
  console.log("==============================================\n");

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB\n");

  // Load all categories into a lookup map
  const allCategories = await Category.find({});
  const categoryMap = {};
  for (const cat of allCategories) categoryMap[cat.name] = cat._id;
  console.log("Loaded " + allCategories.length + " categories\n");

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const countryName of AFRICAN_COUNTRIES) {
    console.log("\n--- " + countryName + " ---");

    for (const [queryFragment, categoryName] of SEARCH_QUERIES) {
      const fullQuery = queryFragment + " in " + countryName;
      const categoryId = categoryMap[categoryName];

      if (!categoryId) {
        console.warn("  Category not found: " + categoryName);
        continue;
      }

      const places = await searchPlaces(fullQuery);
      if (places.length === 0) continue;

      // Take top 5 results per query per country
      const top = places.slice(0, 5);
      let batch = 0;

      for (const place of top) {
        // Skip if already imported by Google Place ID
        const exists = await Company.findOne({ googlePlaceId: place.place_id });
        if (exists) {
          totalSkipped++;
          continue;
        }

        // Skip if company with same name already exists
        const nameExists = await Company.findOne({
          name: {
            $regex: new RegExp(
              "^" + place.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$",
              "i"
            ),
          },
        });
        if (nameExists) {
          totalSkipped++;
          continue;
        }

        // Fetch full details (reviews, phone, website, photos)
        const detail = await getPlaceDetails(place.place_id);
        if (!detail) {
          totalErrors++;
          continue;
        }

        const { city, country } = extractLocation(
          detail.address_components || []
        );

        // Format Google reviews (up to 5)
        const googleReviews = (detail.reviews || []).map((r) => ({
          authorName: r.author_name,
          rating: r.rating,
          text: r.text,
          relativeTimeDescription: r.relative_time_description,
          time: r.time,
          profilePhotoUrl: r.profile_photo_url || "",
        }));

        // Get up to 3 photos
        const googlePhotos = (detail.photos || []).slice(0, 3).map(
          (p) =>
            "https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=" +
            p.photo_reference +
            "&key=" +
            API_KEY
        );

        try {
          const company = new Company({
            name: detail.name,
            url: detail.website || "",
            description: detail.name + " — " + (detail.formatted_address || ""),
            category: categoryId,
            logo: googlePhotos.length > 0 ? googlePhotos[0] : "",
            googlePlaceId: detail.place_id,
            googleRating: detail.rating || null,
            googleReviewCount: detail.user_ratings_total || 0,
            googleReviews,
            googlePhotos,
            address: detail.formatted_address || "",
            phone: detail.formatted_phone_number || "",
            country: country || countryName,
            city,
            source: "google",
          });

          await company.save();
          totalImported++;
          batch++;
        } catch (err) {
          if (err.code === 11000) {
            totalSkipped++;
          } else {
            console.error(
              "  Error saving " + detail.name + ": " + err.message
            );
            totalErrors++;
          }
        }

        // Small delay to stay within API rate limits
        await sleep(200);
      }

      if (batch > 0) {
        console.log(
          "  " +
            queryFragment +
            " -> " +
            batch +
            " imported (" +
            categoryName +
            ")"
        );
      }

      // Delay between queries
      await sleep(300);
    }
  }

  console.log("\n==============================================");
  console.log(
    "Done! Imported: " +
      totalImported +
      " | Skipped: " +
      totalSkipped +
      " | Errors: " +
      totalErrors
  );
  console.log("==============================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
