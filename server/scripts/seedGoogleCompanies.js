/**
 * Seed script — pulls popular African companies from Google Places API (New)
 * and stores them in the DB under the correct category.
 *
 * Setup: add GOOGLE_PLACES_API_KEY and MONGO_URI to server/.env
 *        (the key needs "Places API (New)" enabled).
 *
 * Usage (from the server folder):
 *   node scripts/seedGoogleCompanies.js --help
 *   node scripts/seedGoogleCompanies.js --countries=Nigeria --queries=bank --dry-run
 *   node scripts/seedGoogleCompanies.js --countries=Nigeria,Ghana --per-search=5 --max=50
 *
 * Only listing basics + the Google place ID are stored. Google ratings and
 * up to 5 reviews are loaded live on each company page.
 * Skips any company already in DB (matched by googlePlaceId or name), so it
 * is safe to re-run; a run that hits Google's daily limit can be resumed
 * the next day.
 *
 * COST: every search and every imported company is a billed Google request.
 * Use --dry-run first and --max to cap how many companies one run imports.
 */

const { parseArgs } = require("util");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Company = require("../models/Company");
const { searchText, GooglePlacesError } = require("../utils/googlePlaces");
const { importPlaceAsCompany, ImportSkipError, KNOWN_CATEGORIES } = require("../utils/googleImport");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const HELP = `
Import African companies from Google Places into the database.

Options:
  --countries=A,B     Only these countries (default: all, listed below)
  --queries=x,y       Only search terms containing any of these words,
                      e.g. --queries=bank,hotel (default: all)
  --per-search=N      Results to take from each search, 1-20 (default: 5)
  --max=N             Stop after importing N companies (default: no limit)
  --dry-run           Search Google and list what WOULD be imported, but
                      don't import or save anything (only search costs)
  --help              Show this help
`;

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

// Every category above must be one the importer can create automatically
for (const [, categoryName] of SEARCH_QUERIES) {
  if (!KNOWN_CATEGORIES.has(categoryName)) {
    throw new Error("Seed category is not a known import category: " + categoryName);
  }
}

// ───────── helpers ─────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseList(value) {
  return value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
}

function parseOptions() {
  const { values } = parseArgs({
    options: {
      countries: { type: "string" },
      queries: { type: "string" },
      "per-search": { type: "string", default: "5" },
      max: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  const wantedCountries = parseList(values.countries);
  const isWanted = (country) => wantedCountries.some((w) => w.toLowerCase() === country.toLowerCase());
  const countries = wantedCountries.length ? AFRICAN_COUNTRIES.filter(isWanted) : AFRICAN_COUNTRIES;
  const unknownCountries = wantedCountries.filter(
    (w) => !AFRICAN_COUNTRIES.some((c) => c.toLowerCase() === w.toLowerCase())
  );

  const terms = parseList(values.queries).map((q) => q.toLowerCase());
  const queries = terms.length
    ? SEARCH_QUERIES.filter(([fragment]) => terms.some((t) => fragment.includes(t)))
    : SEARCH_QUERIES;

  const perSearch = Number.parseInt(values["per-search"], 10);
  const max = values.max === undefined ? Infinity : Number.parseInt(values.max, 10);

  return {
    help: values.help,
    dryRun: values["dry-run"],
    countries,
    unknownCountries,
    queries,
    perSearch,
    max,
  };
}

// ───────── main ─────────

async function main() {
  let opts;
  try {
    opts = parseOptions();
  } catch (err) {
    console.error("ERROR: " + err.message);
    console.log(HELP);
    process.exit(1);
  }

  if (opts.help) {
    console.log(HELP);
    console.log("Countries: " + AFRICAN_COUNTRIES.join(", "));
    console.log("Search terms: " + SEARCH_QUERIES.map(([q]) => q).join(", "));
    process.exit(0);
  }

  if (opts.unknownCountries.length) {
    console.error("ERROR: Unknown country: " + opts.unknownCountries.join(", "));
    console.error("Available: " + AFRICAN_COUNTRIES.join(", "));
    process.exit(1);
  }
  if (!opts.queries.length) {
    console.error("ERROR: No search terms match --queries. Run with --help to see them.");
    process.exit(1);
  }
  if (!(opts.perSearch >= 1 && opts.perSearch <= 20)) {
    console.error("ERROR: --per-search must be a number from 1 to 20");
    process.exit(1);
  }
  if (!(opts.max >= 1)) {
    console.error("ERROR: --max must be a number of 1 or more");
    process.exit(1);
  }

  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("ERROR: Set GOOGLE_PLACES_API_KEY in server/.env first.");
    console.error("Enable 'Places API (New)' for the key in Google Cloud.");
    process.exit(1);
  }
  if (!MONGO_URI) {
    console.error("ERROR: Set MONGO_URI in server/.env first.");
    process.exit(1);
  }

  const searches = opts.countries.length * opts.queries.length;
  const maxLookups = opts.dryRun ? 0 : Math.min(searches * opts.perSearch, opts.max);
  console.log("Trustpilotafrica - Google Places Seed Script");
  console.log("==============================================");
  console.log("Countries:   " + opts.countries.join(", "));
  console.log("Searches:    " + opts.queries.map(([q]) => q).join(", "));
  console.log("Plan:        " + searches + " Google searches, up to " + maxLookups + " place lookups");
  console.log("Mode:        " + (opts.dryRun ? "DRY RUN (nothing will be saved)" : "IMPORT"));
  console.log("==============================================\n");

  await mongoose.connect(MONGO_URI);


  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let stopReason = "";
  // Different searches often return the same business; handle each once
  const seenPlaceIds = new Set();

  outer: for (const countryName of opts.countries) {
    console.log("\n--- " + countryName + " ---");

    for (const [queryFragment, categoryName] of opts.queries) {
      const fullQuery = queryFragment + " in " + countryName;

      let places;
      try {
        places = await searchText(fullQuery, { maxResults: opts.perSearch });
      } catch (err) {
        if (err.googleStatus === 429) {
          stopReason = "Google daily limit/quota reached. Re-run tomorrow to continue.";
          break outer;
        }
        console.warn("  Warning: " + fullQuery + " -> " + err.message);
        totalErrors++;
        continue;
      }

      let batch = 0;

      for (const place of places) {
        if (totalImported >= opts.max) {
          stopReason = "Reached --max=" + opts.max + ".";
          break outer;
        }

        if (seenPlaceIds.has(place.placeId)) {
          totalSkipped++;
          continue;
        }
        seenPlaceIds.add(place.placeId);

        // Skip if already imported, or a company with the same name exists
        const exists = await Company.exists({
          $or: [
            { googlePlaceId: place.placeId },
            { name: { $regex: new RegExp("^" + escapeRegex(place.name) + "$", "i") } },
          ],
        });
        if (exists) {
          totalSkipped++;
          continue;
        }

        if (opts.dryRun) {
          console.log("  would import: " + place.name + " — " + place.address);
          totalImported++;
          batch++;
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
            if (err.googleStatus === 429) {
              stopReason = "Google daily limit/quota reached. Re-run tomorrow to continue.";
              break outer;
            }
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
        console.log("  " + queryFragment + " -> " + batch +
          (opts.dryRun ? " would be imported" : " imported") + " (" + categoryName + ")");
      }

      // Delay between queries
      await sleep(300);
    }
  }

  console.log("\n==============================================");
  if (stopReason) console.log("Stopped early: " + stopReason);
  console.log(
    (opts.dryRun ? "Dry run done. Would import: " : "Done! Imported: ") +
      totalImported +
      " | Skipped (already on site or duplicate): " +
      totalSkipped +
      " | Errors: " +
      totalErrors
  );
  console.log("==============================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
