// Run this script once to add slugs to existing companies
// Save as: scripts/addSlugsToCompanies.js

const mongoose = require("mongoose");
const Company = require("../models/Company"); // Adjust path as needed

// Connect to your database
mongoose.connect(
  "mongodb+srv://swaggerlord13:Iamswaggerlord13@trustpilot.6un5ica.mongodb.net/?retryWrites=true&w=majority&appName=TrustPilot"
); // Replace with your actual connection string

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
