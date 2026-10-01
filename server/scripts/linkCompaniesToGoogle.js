/**
 * Link existing companies to their Google place so their page shows the
 * Google rating and up to 5 Google reviews, and fill in empty
 * website/address/phone. Name, city and country are never changed.
 *
 * Only CONFIDENT matches are linked automatically (website matches, or
 * name and location match strongly). Uncertain ones are listed at the end
 * so an admin can link them by hand in Admin → Companies → "Link to Google".
 *
 * Usage (from the server folder):
 *   node scripts/linkCompaniesToGoogle.js --help
 *   node scripts/linkCompaniesToGoogle.js --dry-run --max=20
 *   node scripts/linkCompaniesToGoogle.js --country=Nigeria
 *
 * COST: per company, one Google search plus (if a similar name is found)
 * one place lookup. Already-linked companies are skipped, so it is safe to
 * re-run, and a run that hits Google's daily limit can be resumed later.
 */

const { parseArgs } = require("util");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Company = require("../models/Company");
const { GooglePlacesError } = require("../utils/googlePlaces");
const { ImportSkipError } = require("../utils/googleImport");
const { findConfidentMatch, linkCompanyToPlace } = require("../utils/googleLink");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

const HELP = `
Link existing companies to Google (adds Google reviews to their pages).

Options:
  --country=NAME   Only companies in this country
  --max=N          Check at most N companies this run (default: all unlinked)
  --dry-run        Show what would be linked, but don't save anything
                   (still uses Google searches/lookups to find matches)
  --help           Show this help
`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        country: { type: "string" },
        max: { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch (err) {
    console.error("ERROR: " + err.message);
    console.log(HELP);
    process.exit(1);
  }

  if (values.help) {
    console.log(HELP);
    process.exit(0);
  }

  const dryRun = values["dry-run"];
  const max = values.max === undefined ? 0 : Number.parseInt(values.max, 10);
  if (values.max !== undefined && !(max >= 1)) {
    console.error("ERROR: --max must be a number of 1 or more");
    process.exit(1);
  }
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("ERROR: Set GOOGLE_PLACES_API_KEY in server/.env first.");
    process.exit(1);
  }
  if (!MONGO_URI) {
    console.error("ERROR: Set MONGO_URI in server/.env first.");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);

  const filter = { $or: [{ googlePlaceId: { $exists: false } }, { googlePlaceId: null }, { googlePlaceId: "" }] };
  if (values.country) {
    filter.country = { $regex: new RegExp("^" + escapeRegex(values.country.trim()) + "$", "i") };
  }
  const query = Company.find(filter).select("name city country url domain").sort({ createdAt: 1 });
  if (max) query.limit(max);
  const companies = await query.lean();

  console.log("Trustpilotafrica - Link companies to Google");
  console.log("==============================================");
  console.log("Companies to check: " + companies.length + (values.country ? " (" + values.country + ")" : ""));
  console.log("Google usage:       up to " + companies.length + " searches + " + companies.length + " lookups");
  console.log("Mode:               " + (dryRun ? "DRY RUN (nothing will be saved)" : "LINK"));
  console.log("==============================================\n");

  const counts = { linked: 0, uncertain: 0, none: 0, skipped: 0, errors: 0 };
  const uncertain = [];
  let stopReason = "";

  for (const company of companies) {
    const label = company.name + (company.city ? " (" + company.city + ")" : "");
    try {
      const match = await findConfidentMatch(company);

      if (match.status === "none") {
        counts.none++;
        console.log("  -  " + label + ": " + match.reason);
      } else if (match.status === "uncertain") {
        counts.uncertain++;
        uncertain.push(label + "  →  maybe \"" + match.candidate.name + "\", " +
          match.candidate.address + " [" + match.reason + "]");
        console.log("  ?  " + label + ": " + match.reason);
      } else if (dryRun) {
        counts.linked++;
        console.log("  ✓  " + label + " → " + match.candidate.name + " [" + match.reason + "] (dry run)");
      } else {
        await linkCompanyToPlace(company._id, match.candidate.placeId, match.details);
        counts.linked++;
        console.log("  ✓  " + label + " → " + match.candidate.name + " [" + match.reason + "]");
      }
    } catch (err) {
      if (err instanceof GooglePlacesError && err.googleStatus === 429) {
        stopReason = "Google daily limit/quota reached. Re-run tomorrow to continue.";
        break;
      }
      if (err instanceof ImportSkipError) {
        counts.skipped++;
        console.log("  -  " + label + ": " + err.message);
      } else {
        counts.errors++;
        console.warn("  !  " + label + ": " + err.message);
      }
    }

    // Small delay to stay within API rate limits
    await sleep(200);
  }

  console.log("\n==============================================");
  if (stopReason) console.log("Stopped early: " + stopReason);
  console.log(
    (dryRun ? "Dry run done. Would link: " : "Done! Linked: ") + counts.linked +
      " | Needs a manual check: " + counts.uncertain +
      " | Not found on Google: " + counts.none +
      " | Skipped: " + counts.skipped +
      " | Errors: " + counts.errors
  );
  if (uncertain.length) {
    console.log("\nCheck these by hand (Admin → Companies → Link to Google):");
    for (const line of uncertain) console.log("  - " + line);
  }
  console.log("==============================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
