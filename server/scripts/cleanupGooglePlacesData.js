/**
 * One-off cleanup for companies imported with the old (legacy) Google
 * Places code.
 *
 * - Removes stored Google ratings, reviews and photos. Google's terms only
 *   allow the place ID to be stored; the company page now loads these live.
 * - Clears logos that point at the legacy Place Photo endpoint. Those URLs
 *   contain the API key in plain text, so they must not be served.
 *
 * Usage (from the server folder):
 *   node scripts/cleanupGooglePlacesData.js            # preview only
 *   node scripts/cleanupGooglePlacesData.js --apply    # make the changes
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Company = require("../models/Company");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const APPLY = process.argv.includes("--apply");

const LEGACY_FIELDS = ["googleRating", "googleReviewCount", "googleReviews", "googlePhotos"];
const KEYED_PHOTO_URL = /maps\.googleapis\.com\/maps\/api\/place\/photo/;

async function main() {
  if (!MONGO_URI) {
    console.error("No MONGO_URI found in environment. Set it in server/.env");
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI);
  // Raw collection: these fields are no longer in the Company schema
  const companies = Company.collection;

  const legacyFilter = { $or: LEGACY_FIELDS.map((field) => ({ [field]: { $exists: true } })) };
  const keyedLogoFilter = { logo: { $regex: KEYED_PHOTO_URL } };

  const legacyCount = await companies.countDocuments(legacyFilter);
  const keyedLogoCount = await companies.countDocuments(keyedLogoFilter);

  console.log(`Companies with stored Google ratings/reviews/photos: ${legacyCount}`);
  console.log(`Companies whose logo contains a Google API key:      ${keyedLogoCount}`);

  if (!APPLY) {
    console.log("\nPreview only. Re-run with --apply to make these changes.");
  } else {
    const unset = Object.fromEntries(LEGACY_FIELDS.map((field) => [field, ""]));
    const legacyResult = await companies.updateMany(legacyFilter, { $unset: unset });
    const logoResult = await companies.updateMany(keyedLogoFilter, { $set: { logo: "" } });
    console.log(`\nRemoved Google data from ${legacyResult.modifiedCount} companies`);
    console.log(`Cleared ${logoResult.modifiedCount} logos that exposed the API key`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Cleanup failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
