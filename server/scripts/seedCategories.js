/**
 * Seed script — populates categories and subcategories
 * Run: node scripts/seedCategories.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const Category = require("../models/Category");
const SubCategory = require("../models/Subcategory");

const data = {
  "Animals & Pets": [
    "Animal Health", "Animal Parks & Zoo", "Cats & Dogs",
    "Horses & Riding", "Pet Services", "Pet Stores"
  ],
  "Beauty & Well-being": [
    "Cosmetics & Makeup", "Hair Care & Styling", "Personal Care",
    "Salons & Clinics", "Tattoos & Piercings", "Wellness & Spa", "Yoga & Meditation"
  ],
  "Business Services": [
    "Administration & Services", "Associations & Centers", "HR & Recruiting",
    "Import & Export", "IT & Communication", "Office Space & Supplies",
    "Print & Graphic Design", "Research & Development", "Sales & Marketing",
    "Shipping & Logistics", "Wholesale"
  ],
  "Construction & Manufacturing": [
    "Architects & Engineers", "Building Materials", "Chemicals & Plastic",
    "Construction Services", "Contractors & Consultants", "Factory Equipment",
    "Garden & Landscaping", "Industrial Supplies", "Manufacturing",
    "Production Services", "Tools & Equipment"
  ],
  "Education & Training": [
    "Colleges & Universities", "Courses & Classes", "Education Services",
    "Language Learning", "Music & Theater Classes", "School & High School",
    "Special Schools", "Vocational Training"
  ],
  "Electronics & Technology": [
    "Appliances & Electronics", "Audio & Visual", "Computers & Phones",
    "Internet & Software", "Repair & Services"
  ],
  "Events & Entertainment": [
    "Children's Entertainment", "Clubbing & Nightlife", "Events & Venues",
    "Gaming", "Museums & Exhibits", "Music & Movies",
    "Theater & Opera", "Wedding & Party"
  ],
  "Food, Beverages & Tobacco": [
    "Agriculture & Produce", "Bakery & Pastry", "Beer & Wine",
    "Beverages & Liquor", "Candy & Chocolate", "Coffee & Tea",
    "Food Production", "Fruits & Vegetables", "Grocery Stores & Markets",
    "Lunch & Catering", "Meat, Seafood & Eggs"
  ],
  "Health & Medical": [
    "Clinics", "Dental Services", "Diagnostics & Testing",
    "Doctors & Surgeons", "Health Equipment", "Hospital & Emergency",
    "Medical Specialists", "Mental Health", "Pharmacy & Medicine",
    "Physical Aids", "Pregnancy & Children", "Therapy & Senior Health",
    "Vision & Hearing"
  ],
  "Hobbies & Crafts": [
    "Art & Handicraft", "Fishing & Hunting", "Hobbies",
    "Music & Instruments", "Needlework & Knitting", "Outdoor Activities",
    "Painting & Paper"
  ],
  "Home & Garden": [
    "Bathroom & Kitchen", "Decoration & Interior", "Energy & Heating",
    "Fabric & Stationery", "Furniture Stores", "Garden & Pond",
    "Home & Garden Services", "Home Goods Stores", "Home Improvements"
  ],
  "Home Services": [
    "Cleaning Service Providers", "Craftsman", "House Services",
    "House Sitting & Security", "Moving & Storage", "Plumbing & Sanitation",
    "Repair Service Providers"
  ],
  "Legal Services & Government": [
    "Customs & Toll", "Government Department", "Law Enforcement",
    "Lawyers & Attorneys", "Legal Service Providers", "Libraries & Archives",
    "Municipal Department", "Registration Services"
  ],
  "Media & Publishing": [
    "Books & Magazines", "Media & Information", "Photography", "Video & Sound"
  ],
  "Money & Insurance": [
    "Accounting & Tax", "Banking & Money", "Credit & Debt Services",
    "Insurance", "Investments & Wealth", "Real Estate"
  ],
  "Public & Local Services": [
    "Employment & Career", "Funeral & Memorial", "Housing Associations",
    "Kids & Family", "Nature & Environment", "Professional Organizations",
    "Public Services & Welfare", "Religious Institutions", "Waste Management"
  ],
  "Restaurants & Bars": [
    "African & Pacific Cuisine", "Bars & Cafes", "Chinese & Korean Cuisine",
    "European Cuisine", "General Restaurants", "Japanese Cuisine",
    "Mediterranean Cuisine", "Middle Eastern Cuisine",
    "North & South American Cuisine", "Southeast Asian Cuisine",
    "Takeaway", "Vegetarian & Diet"
  ],
  "Shopping & Fashion": [
    "Accessories", "Clothing & Underwear", "Clothing Rental & Repair",
    "Costume & Wedding", "Jewelry & Watches", "Malls & Marketplaces"
  ],
  "Sports": [
    "Ball Games", "Dancing & Gymnastics", "Equipment & Associations",
    "Extreme Sports", "Fitness & Weight Lifting", "Golf & Ultimate",
    "Hockey & Ice Skating", "Martial Arts & Wrestling",
    "Outdoor & Winter Sports", "Swimming & Water Sports",
    "Tennis & Racquet Sports"
  ],
  "Travel & Vacation": [
    "Accommodation & Lodging", "Activities & Tours", "Airlines & Air Travel",
    "Hotels", "Travel Agencies"
  ],
  "Utilities": [
    "Energy & Power", "Oil & Fuel", "Water Utilities"
  ],
  "Vehicles & Transportation": [
    "Air & Water Transport", "Airports & Parking", "Auto Parts & Wheels",
    "Bicycles", "Cars & Trucks", "Motorcycle & Powersports",
    "Other Vehicles & Trailers", "Taxis & Public Transport",
    "Vehicle Rental", "Vehicle Repair & Fuel"
  ],
  // === Africa-specific categories ===
  "Fintech & Mobile Money": [
    "Mobile Money Services", "Digital Banking", "Payment Solutions",
    "Microfinance", "Cryptocurrency Exchanges", "Savings & Investment Apps"
  ],
  "Telecommunications": [
    "Mobile Network Operators", "Internet Service Providers",
    "Cable & Satellite TV", "Phone & Airtime Dealers"
  ],
  "Real Estate & Property": [
    "Property Developers", "Estate Agents", "Property Management",
    "Short-Let Apartments", "Co-Working Spaces"
  ],
  "Logistics & Delivery": [
    "Courier & Delivery Services", "Freight & Cargo",
    "Warehousing", "Last-Mile Delivery", "Moving Companies"
  ],
  "Agriculture & Agritech": [
    "Farm Inputs & Equipment", "Agro-Processing", "Livestock & Poultry",
    "Agritech Platforms", "Fertilizers & Seeds"
  ]
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    let catCount = 0;
    let subCount = 0;

    for (const [categoryName, subcategories] of Object.entries(data)) {
      // Check if category already exists
      let category = await Category.findOne({ name: categoryName });
      if (!category) {
        category = await Category.create({ name: categoryName });
        catCount++;
        console.log(`✅ Created category: ${categoryName}`);
      } else {
        console.log(`⏭️  Category exists: ${categoryName}`);
      }

      // Create subcategories
      for (const subName of subcategories) {
        const exists = await SubCategory.findOne({ name: subName, category: category._id });
        if (!exists) {
          await SubCategory.create({ name: subName, category: category._id });
          subCount++;
        }
      }
    }

    console.log(`\n🎉 Done! Added ${catCount} new categories and ${subCount} new subcategories.`);
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

seed();
