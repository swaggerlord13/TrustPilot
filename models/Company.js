const mongoose = require("mongoose");

// Helper function to generate slug
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .trim();
};

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Company name
    slug: {
      type: String,
      unique: true,
      index: true,
    }, // URL-friendly version of name
    url: { type: String }, // Optional website URL
    description: { type: String }, // About the company
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category", // Links company to a category
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory", // Links company to a subcategory
    },
    logo: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Auto-generate slug before saving
companySchema.pre("save", async function (next) {
  if (this.isModified("name") || this.isNew) {
    let baseSlug = generateSlug(this.name);
    let uniqueSlug = baseSlug;
    let counter = 1;

    // Check for existing slugs and make unique
    while (
      await mongoose.models.Company.findOne({
        slug: uniqueSlug,
        _id: { $ne: this._id },
      })
    ) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    this.slug = uniqueSlug;
  }
  next();
});

module.exports = mongoose.model("Company", companySchema);
