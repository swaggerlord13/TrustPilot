const mongoose = require("mongoose");
const dotenv = require("dotenv");
const slugify = require("slugify"); // npm i slugify

dotenv.config({ path: "../.env" }); // ensure correct path to your .env

// Import models
const Category = require("../models/Category");
const SubCategory = require("../models/SubCategory");

// Data to seed
const categoriesData = [
  { name: "Electronics" },
  { name: "Food" },
  { name: "Clothing" },
];

const subCategoriesData = [
  { name: "Smartphones", categoryName: "Electronics" },
  { name: "Laptops", categoryName: "Electronics" },
  { name: "Restaurants", categoryName: "Food" },
  { name: "Snacks", categoryName: "Food" },
  { name: "Men's Wear", categoryName: "Clothing" },
  { name: "Women's Wear", categoryName: "Clothing" },
];

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Clear existing data
    await SubCategory.deleteMany({});
    await Category.deleteMany({});

    // Insert categories with slugs
    const createdCategories = await Category.insertMany(
      categoriesData.map((c) => ({
        ...c,
        slug: slugify(c.name, { lower: true }),
      }))
    );

    // Insert subcategories with proper category IDs and slugs
    for (const sub of subCategoriesData) {
      const category = createdCategories.find(
        (c) => c.name === sub.categoryName
      );
      if (category) {
        await SubCategory.create({
          name: sub.name,
          category: category._id,
          slug: slugify(sub.name, { lower: true }),
        });
      }
    }

    console.log("Database seeded successfully!");
    process.exit();
  } catch (err) {
    console.error("Seeding error:", err);
    process.exit(1);
  }
};

seedDB();
