/**
 * Migration: Backfill domain field and update slugs to include city+country.
 * 
 * Run once after deploying the updated Company model:
 *   node server/scripts/migrateCompanySlugs.js
 * 
 * What it does:
 *  1. Extracts domain from each company's URL and saves it
 *  2. Regenerates slugs to include city + country (e.g. "airtel-lagos-nigeria")
 *  3. Handles collisions with a counter suffix
 *  4. Logs every change so you can review
 * 
 * Safe to run multiple times — it skips companies already migrated.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!MONGO_URI) {
  console.error("No MONGO_URI found in environment. Set it in server/.env");
  process.exit(1);
}

const extractDomain = (url) => {
  if (!url) return null;
  try {
    let hostname = new URL(url.startsWith("http") ? url : "https://" + url).hostname;
    hostname = hostname.replace(/^www\./, "");
    return hostname.toLowerCase();
  } catch (e) {
    return null;
  }
};

const generateSlug = (name, city, country) => {
  let parts = [name];
  if (city) parts.push(city);
  if (country) parts.push(country);
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
};

async function migrate() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB");

  const Company = mongoose.connection.collection("companies");
  const allCompanies = await Company.find({}).toArray();
  console.log(`Found ${allCompanies.length} companies to process`);

  const usedSlugs = new Set();
  let updated = 0;
  let skipped = 0;

  for (const company of allCompanies) {
    const updates = {};
    let changed = false;

    // 1. Backfill domain
    if (!company.domain && company.url) {
      const domain = extractDomain(company.url);
      if (domain) {
        updates.domain = domain;
        changed = true;
      }
    }

    // 2. Regenerate slug with city+country
    const newBaseSlug = generateSlug(company.name, company.city, company.country);
    
    // Only update if slug would change (has city/country to add)
    if (newBaseSlug !== company.slug && (company.city || company.country)) {
      let finalSlug = newBaseSlug;
      let counter = 1;

      while (usedSlugs.has(finalSlug)) {
        finalSlug = `${newBaseSlug}-${counter}`;
        counter++;
      }

      // Also check DB for existing slugs from other companies
      const existing = await Company.findOne({ 
        slug: finalSlug, 
        _id: { $ne: company._id } 
      });
      
      if (existing) {
        while (await Company.findOne({ slug: `${newBaseSlug}-${counter}`, _id: { $ne: company._id } })) {
          counter++;
        }
        finalSlug = `${newBaseSlug}-${counter}`;
      }

      updates.slug = finalSlug;
      usedSlugs.add(finalSlug);
      changed = true;
      console.log(`  Slug: "${company.slug}" → "${finalSlug}" (${company.name}, ${company.city || "no city"}, ${company.country || "no country"})`);
    } else {
      usedSlugs.add(company.slug);
    }

    if (changed) {
      await Company.updateOne({ _id: company._id }, { $set: updates });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped (no changes): ${skipped}`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
