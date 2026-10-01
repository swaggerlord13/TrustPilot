const mongoose = require("mongoose");
const slugify = require("slugify");
// Shared domain parsing, so brands and companies match the same way
const { brandDomainOf } = require("../utils/domains");

// A brand groups the locations (Company documents) of one business, e.g.
// "MTN" groups "MTN Ikoyi, Lagos" and "MTN Dugbe, Ibadan". Each location keeps
// its own page and reviews; the brand page shows them together.
const brandSchema = new mongoose.Schema(
  {
    // Display name, e.g. "MTN"
    name: { type: String, required: true, trim: true, maxlength: 100 },
    // Lower-case copy of the name, used to stop duplicates like "MTN" and "mtn"
    nameKey: { type: String, unique: true },
    // URL-friendly name used in /brand/:slug, e.g. "mtn"
    slug: { type: String, unique: true },
    // Official website, e.g. "https://www.mtn.ng"
    website: { type: String, trim: true, default: "" },
    // Root domain taken from website, e.g. "mtn.ng"; used to match locations.
    // Unique so one website can only belong to one brand. Empty for shared
    // sites (facebook.com, ...) so they never pull in unrelated businesses.
    domain: { type: String, unique: true, sparse: true },
    // Optional logo URL; the site falls back to the website favicon
    logo: { type: String, trim: true, default: "" },
    // Short description shown on the brand page
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    // Main category of the brand, e.g. Telecommunications
    category: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  },
  // Adds createdAt / updatedAt
  { timestamps: true }
);

// Keep nameKey, slug and domain in sync with name and website before saving
brandSchema.pre("validate", async function (next) {
  // Case-insensitive key for the unique name index, on create and rename
  if (this.isNew || this.isModified("name")) this.nameKey = this.name.trim().toLowerCase();
  // Slug is set once, on create, so renaming a brand never breaks its URL
  if (this.isNew && !this.slug) {
    // Base slug from the name, e.g. "MTN Nigeria" -> "mtn-nigeria"
    const base = slugify(this.name, { lower: true, strict: true }) || "brand";
    // Start with the base and add -2, -3, ... if it is taken by another brand
    let slug = base;
    // Counter for the numeric suffix
    let n = 2;
    // Look for another brand already using this slug
    while (await this.constructor.exists({ slug, _id: { $ne: this._id } })) {
      // Taken: try the next suffix
      slug = `${base}-${n++}`;
    }
    // Save the free slug
    this.slug = slug;
  }
  // Recompute the domain whenever the website changes
  if (this.isNew || this.isModified("website")) {
    // undefined (not null) so the sparse unique index skips brands without one
    this.domain = brandDomainOf(this.website) || undefined;
  }
  // Continue saving
  next();
});

module.exports = mongoose.model("Brand", brandSchema);
