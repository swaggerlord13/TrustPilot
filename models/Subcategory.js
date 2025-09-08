const mongoose = require("mongoose");
const slugify = require("slugify");

// Schema for Subcategory
const subcategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true, // Subcategory must always have a name
    },
    slug: {
      type: String,
      unique: true, // URL-friendly identifier
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category", // Links subcategory to a category
      required: true,
    },
  },
  { timestamps: true }
);

// Before saving, generate slug
subcategorySchema.pre("save", function (next) {
  this.slug = slugify(this.name, { lower: true, strict: true });
  next();
});

// Export model
module.exports = mongoose.model("Subcategory", subcategorySchema);
