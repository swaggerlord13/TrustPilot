const mongoose = require("mongoose");

// Helper function to generate slug from name + city + country
const generateSlug = (name, city, country) => {
  let parts = [name];
  if (city) parts.push(city);
  if (country) parts.push(country);
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
};

// Helper to extract root domain from a URL for duplicate checking
const extractDomain = (url) => {
  if (!url) return null;
  try {
    let hostname = new URL(url.startsWith("http") ? url : "https://" + url).hostname;
    // Strip www. prefix
    hostname = hostname.replace(/^www\./, "");
    return hostname.toLowerCase();
  } catch (e) {
    return null;
  }
};

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    url: { type: String },
    domain: { type: String, index: true, sparse: true }, // extracted root domain
    description: { type: String },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
    },
    logo: {
      type: String,
      default: "",
    },

    // Google Places data
    googlePlaceId: {
      type: String,
      index: true,
      sparse: true,
    },
    googleRating: {
      type: Number,
      default: null,
    },
    googleReviewCount: {
      type: Number,
      default: 0,
    },
    googleReviews: [
      {
        authorName: String,
        rating: Number,
        text: String,
        relativeTimeDescription: String,
        time: Number,
        profilePhotoUrl: String,
      },
    ],
    googlePhotos: [String],
    address: { type: String },
    phone: { type: String },
    country: { type: String },
    city: { type: String },
    source: {
      type: String,
      enum: ["user", "google"],
      default: "user",
    },
  },
  { timestamps: true }
);

// Compound index: same name + city + country = duplicate
companySchema.index(
  { name: 1, city: 1, country: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 }, // case-insensitive
    name: "unique_name_city_country",
  }
);

// Auto-generate slug and domain before saving
companySchema.pre("save", async function (next) {
  // Always extract domain from URL when url changes
  if (this.isModified("url") || this.isNew) {
    this.domain = extractDomain(this.url);
  }

  // Generate slug when name, city, or country changes
  if (this.isModified("name") || this.isModified("city") || this.isModified("country") || this.isNew) {
    let baseSlug = generateSlug(this.name, this.city, this.country);
    let uniqueSlug = baseSlug;
    let counter = 1;

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

// Static method to check for duplicates before creating
companySchema.statics.checkDuplicate = async function (name, city, country, url, excludeId) {
  const errors = [];

  // Check 1: Same name + city + country (case-insensitive)
  const nameMatch = await this.findOne({
    name: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"),
    city: city ? new RegExp("^" + city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") : { $in: [null, ""] },
    country: country ? new RegExp("^" + country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") : { $in: [null, ""] },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  });

  if (nameMatch) {
    errors.push({
      type: "name_location",
      message: `A company named "${nameMatch.name}" already exists in ${nameMatch.city || "unknown city"}, ${nameMatch.country || "unknown country"}.`,
      existing: { id: nameMatch._id, name: nameMatch.name, slug: nameMatch.slug, city: nameMatch.city, country: nameMatch.country },
    });
  }

  // Check 2: Same website domain (if URL provided)
  if (url) {
    const domain = extractDomain(url);
    if (domain) {
      const domainFilter = {
        domain: domain,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      };

      // Only flag domain duplicate if same city+country too
      // (e.g. airtel.com.ng in Lagos vs airtel.com.ng in Abuja are different)
      if (city) domainFilter.city = new RegExp("^" + city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
      if (country) domainFilter.country = new RegExp("^" + country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");

      const domainMatch = await this.findOne(domainFilter);
      if (domainMatch) {
        errors.push({
          type: "domain",
          message: `A company with website domain "${domain}" already exists in ${domainMatch.city || "unknown city"}, ${domainMatch.country || "unknown country"}: ${domainMatch.name}.`,
          existing: { id: domainMatch._id, name: domainMatch.name, slug: domainMatch.slug, city: domainMatch.city, country: domainMatch.country },
        });
      }
    }
  }

  return errors.length > 0 ? errors : null;
};

// Export the helper so controller can use it
companySchema.statics.extractDomain = extractDomain;

module.exports = mongoose.model("Company", companySchema);
