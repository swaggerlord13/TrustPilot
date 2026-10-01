/**
 * Group existing companies into brands by shared website domain.
 * Example: "MTN Ikoyi" and "MTN Ibadan" both use mtn.ng -> brand "MTN".
 *
 * Only companies WITHOUT a brand are grouped, and never ones an admin
 * attached or removed by hand. Preview by default; nothing is
 * saved unless you pass --apply. Review the preview first: shared domains
 * like facebook.com are skipped, but check the proposed brand names.
 *
 * Usage (from the server folder):
 *   node scripts/groupCompaniesIntoBrands.js            # preview
 *   node scripts/groupCompaniesIntoBrands.js --apply    # create brands + attach
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Brand = require("../models/Brand");
const Company = require("../models/Company");

// Connection string from server/.env
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
// Save changes only when --apply is passed
const APPLY = process.argv.includes("--apply");

// Shared sites (facebook.com, web.facebook.com, ...) are never grouped
const { isSharedDomain } = require("../utils/domains");

/**
 * Brand name from location names: the words they all start with.
 * ["MTN Ikoyi", "MTN Dugbe Ibadan"] -> "MTN". When they share no first word,
 * fall back to the website name: "glo.com" -> "Glo".
 */
function proposeBrandName(names, domain) {
  // Split each name into words
  const wordLists = names.map((n) => n.trim().split(/\s+/));
  // Shared leading words, compared case-insensitively
  const shared = [];
  // Check word positions one by one using the first name as reference
  for (let i = 0; i < wordLists[0].length; i++) {
    // Word at this position in the first name
    const word = wordLists[0][i];
    // Stop at the first position where any name differs
    if (!wordLists.every((w) => w[i] && w[i].toLowerCase() === word.toLowerCase())) break;
    // Same in every name: keep it
    shared.push(word);
  }
  // Use the shared words when there are any
  if (shared.length) return shared.join(" ");
  // Otherwise the first part of the domain, capitalised: "glo.com" -> "Glo"
  const label = domain.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Most common value in a list (ties: first seen), ignoring empty values.
 */
function mostCommon(values) {
  // Count each non-empty value
  const counts = new Map();
  for (const v of values) if (v) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
  // Highest count wins
  let best = null;
  for (const [v, c] of counts) if (!best || c > best.c) best = { v, c };
  // The winning value, or null when the list was empty
  return best ? best.v : null;
}

async function main() {
  // Need a database to work on
  if (!MONGO_URI) {
    console.error("No MONGO_URI found in environment. Set it in server/.env");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);

  // Unbranded companies with a website domain, grouped by that domain
  const groups = await Company.aggregate([
    // Unbranded companies with a website, skipping ones an admin decided by hand
    { $match: { brand: null, brandSetByAdmin: { $ne: true }, domain: { $nin: [null, ""] } } },
    { $group: { _id: "$domain", ids: { $push: "$_id" }, names: { $push: "$name" }, urls: { $push: "$url" }, categories: { $push: "$category" } } },
    // A brand needs at least two locations
    { $match: { "ids.1": { $exists: true } } },
    { $sort: { _id: 1 } },
  ]);

  console.log(`Mode: ${APPLY ? "APPLY (saving changes)" : "PREVIEW (nothing is saved)"}\n`);
  // Running totals for the summary
  let brandsCreated = 0;
  let locationsAttached = 0;
  let skipped = 0;

  for (const group of groups) {
    // The shared website domain, e.g. "mtn.ng"
    const domain = group._id;
    // Never group by social media or marketplace domains
    if (isSharedDomain(domain)) {
      console.log(`  skip  ${domain}: shared by unrelated businesses`);
      skipped++;
      continue;
    }
    // Reuse a brand that already owns this domain, if there is one
    let brand = await Brand.findOne({ domain });
    // Otherwise propose a new brand from the location names
    const name = brand ? brand.name : proposeBrandName(group.names, domain);
    console.log(`  ${brand ? "join " : "new  "} "${name}" (${domain}): ${group.names.join(", ")}`);
    // Preview stops here
    if (!APPLY) continue;
    if (!brand) {
      try {
        // Create the brand with the most common website and category
        brand = await Brand.create({
          name,
          website: mostCommon(group.urls) || `https://${domain}`,
          category: mostCommon(group.categories) || undefined,
        });
        brandsCreated++;
      } catch (err) {
        // Same name already used by a brand with a different domain: let a human decide
        if (err.code === 11000) {
          console.log(`        ! a brand named "${name}" already exists with another website; skipped`);
          skipped++;
          continue;
        }
        throw err;
      }
    }
    // Attach the locations that are still unbranded
    const result = await Company.updateMany(
      { _id: { $in: group.ids }, brand: null, brandSetByAdmin: { $ne: true } },
      { $set: { brand: brand._id } }
    );
    locationsAttached += result.modifiedCount;
  }

  console.log(`\nGroups found: ${groups.length} | Skipped: ${skipped}`);
  if (APPLY) console.log(`Brands created: ${brandsCreated} | Locations attached: ${locationsAttached}`);
  else console.log("Preview only. Re-run with --apply to save.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  // Report and exit non-zero so failures are visible
  console.error("Grouping failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
