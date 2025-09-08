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

// Before saving, auto-generate slug
categorySchema.pre("save", function (next) {
  this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

// Export model
module.exports = mongoose.model("Category", categorySchema);
