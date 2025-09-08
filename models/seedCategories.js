// models/seedCategories.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Category = require("./Categories"); // ✅ Import Category model

dotenv.config(); // Load .env for DB connection

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Categories + Subcategories data
const categories = [
  {
    name: "Technology",
    subcategories: [
      { name: "Software" },
      { name: "Hardware" },
      { name: "AI & Machine Learning" },
      { name: "Cybersecurity" },
    ],
  },
  {
    name: "Food & Drink",
    subcategories: [
      { name: "Restaurants" },
      { name: "Cafes" },
      { name: "Street Food" },
      { name: "Bars & Lounges" },
    ],
  },
  {
    name: "Travel",
    subcategories: [
      { name: "Hotels" },
      { name: "Flights" },
      { name: "Car Rentals" },
      { name: "Tourism" },
    ],
  },
];

// Seeding function
const seedDB = async () => {
  try {
    await Category.deleteMany(); // Clear old data
    console.log("🗑️ Old categories removed");

    for (const cat of categories) {
      const category = new Category(cat);
      await category.save(); // this will trigger slugify pre("save")
    }
    console.log("🌱 Categories seeded successfully");

    mongoose.connection.close(); // Close connection
  } catch (err) {
    console.error("❌ Error seeding data:", err);
    mongoose.connection.close();
  }
};

// Run seeding
seedDB();
