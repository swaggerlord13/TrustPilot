// Run this script once to add slugs to existing companies
// Save as: scripts/addSlugsToCompanies.js

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Company = require("../models/Company");

// Connection string comes from server/.env (never hard-code credentials)
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("No MONGO_URI found in environment. Set it in server/.env");
  process.exit(1);
}
mongoose.connect(MONGO_URI);

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
};

const addSlugsToExistingCompanies = async () => {
  try {
    const companies = await Company.find({ slug: { $exists: false } });

    console.log(`Found ${companies.length} companies without slugs`);

    for (let company of companies) {
      let baseSlug = generateSlug(company.name);
      let uniqueSlug = baseSlug;
      let counter = 1;

      // Check for duplicates
      while (
        await Company.findOne({ slug: uniqueSlug, _id: { $ne: company._id } })
      ) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      company.slug = uniqueSlug;
      await company.save();
      console.log(`Updated ${company.name} -> ${uniqueSlug}`);
    }

    console.log("✅ All companies now have slugs!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
};

addSlugsToExistingCompanies();
