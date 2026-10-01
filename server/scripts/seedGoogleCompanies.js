/**
 * Seed script — pulls popular African companies from Google Places API (New)
 * and stores them in the DB under the correct category.
 *
 * Usage:
 *   1. Add GOOGLE_PLACES_API_KEY=your_key to server/.env
 *      (enable "Places API (New)" for the key)
 *   2. Run: node scripts/seedGoogleCompanies.js
 *
 * Only listing basics + the Google place ID are stored. Google ratings and
 * reviews are not stored; company pages load them live.
 * Skips any company already in DB (matched by googlePlaceId or name).
 *
 * COST: every search and every imported company is a billed Google request.
 * With all countries and queries below that is ~340 searches and up to
 * ~1,700 place lookups, so trim the lists or set daily quotas first.
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Company = require("../models/Company");
const Category = require("../models/Category");
const { searchText, GooglePlacesError } = require("../utils/googlePlaces");
const { importPlaceAsCompany, ImportSkipError } = require("../utils/googleImport");

if (!process.env.GOOGLE_PLACES_API_KEY) {
  console.error("ERROR: Set GOOGLE_PLACES_API_KEY in your .env file first.");
  console.error("Get one at https://console.cloud.google.com -> APIs & Services -> Credentials");
  console.error("Enable 'Places API (New)' for the key.");
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

      let places;
      try {
        // Take top 5 results per query per country
        places = await searchText(fullQuery, { maxResults: 5 });
      } catch (err) {
        console.warn("  Warning: " + fullQuery + " -> " + err.message);
        totalErrors++;
        continue;
      }
      if (places.length === 0) continue;

      let batch = 0;

      for (const place of places) {
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

        try {
          await importPlaceAsCompany(place.placeId, {
            categoryOverride: categoryName,
            fallbackCountry: countryName,
          });
          totalImported++;
          batch++;
        } catch (err) {
          if (err instanceof ImportSkipError) {
            totalSkipped++;
          } else if (err instanceof GooglePlacesError) {
            console.warn("  Warning: " + place.name + " -> " + err.message);
            totalErrors++;
          } else {
            console.error("  Error saving " + place.name + ": " + err.message);
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
