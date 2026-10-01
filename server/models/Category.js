const mongoose = require("mongoose");
const slugify = require("slugify");

// Schema for Category
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // Category must always have a name
      unique: true, // Prevent duplicate category names
    },
    slug: {
      type: String,
      unique: true, // URL-friendly identifier for frontend navigation
    },
  },
  { timestamps: true } // Adds createdAt & updatedAt
);

// Slug is made once, when the category is created. Renaming keeps it, so
// links and search results pointing at /categories/<slug> keep working
// (the same rule as brands)
categorySchema.pre("save", function (next) {
  if (this.isNew || !this.slug) this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

// Export model
module.exports = mongoose.model("Category", categorySchema);
