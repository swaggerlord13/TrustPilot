/**
 * Turns Google places into Trustpilotafrica company listings.
 * Shared by the admin import routes and scripts/seedGoogleCompanies.js.
 *
 * Missing categories from our own mapping are created automatically.
 * Only listing basics are stored (name, website, address, phone, city,
 * country) plus the place ID. Google ratings, reviews and photos are NOT
 * stored; the company page fetches them live via getPlaceReviews().
 */

const Company = require("../models/Company");
const Category = require("../models/Category");
const { getPlaceForImport } = require("./googlePlaces");

// ============================================================
// Google Places → Trustpilotafrica category mapping
// Maps common Google Place types to our category names
// ============================================================
const FALLBACK_CATEGORY = "Business Services";

const GOOGLE_TYPE_TO_CATEGORY = {
  // Animals & Pets
  pet_store: "Animals & Pets",
  veterinary_care: "Animals & Pets",
  zoo: "Animals & Pets",

  // Beauty & Well-being
  beauty_salon: "Beauty & Well-being",
  hair_care: "Beauty & Well-being",
  spa: "Beauty & Well-being",

  // Business Services
  accounting: "Business Services",
  lawyer: "Legal Services & Government",
  real_estate_agency: "Real Estate & Property",

  // Construction & Manufacturing
  general_contractor: "Construction & Manufacturing",
  electrician: "Construction & Manufacturing",
  plumber: "Construction & Manufacturing",

  // Education & Training
  school: "Education & Training",
  university: "Education & Training",
  library: "Education & Training",

  // Electronics & Technology
  electronics_store: "Electronics & Technology",
  computer_store: "Electronics & Technology",

  // Events & Entertainment
  amusement_park: "Events & Entertainment",
  movie_theater: "Events & Entertainment",
  night_club: "Events & Entertainment",
  casino: "Events & Entertainment",

  // Food, Beverages & Tobacco
  bakery: "Food, Beverages & Tobacco",
  grocery_or_supermarket: "Food, Beverages & Tobacco",
  supermarket: "Food, Beverages & Tobacco",
  liquor_store: "Food, Beverages & Tobacco",

  // Health & Medical
  hospital: "Health & Medical",
  doctor: "Health & Medical",
  dentist: "Health & Medical",
  pharmacy: "Health & Medical",
  physiotherapist: "Health & Medical",

  // Home & Garden
  home_goods_store: "Home & Garden",
  furniture_store: "Home & Garden",
  hardware_store: "Home & Garden",

  // Home Services
  locksmith: "Home Services",
  moving_company: "Home Services",
  painter: "Home Services",
  roofing_contractor: "Home Services",

  // Legal Services & Government
  courthouse: "Legal Services & Government",
  city_hall: "Legal Services & Government",
  local_government_office: "Legal Services & Government",

  // Money & Insurance
  bank: "Money & Insurance",
  atm: "Money & Insurance",
  insurance_agency: "Money & Insurance",
  finance: "Money & Insurance",

  // Restaurants & Bars
  restaurant: "Restaurants & Bars",
  bar: "Restaurants & Bars",
  cafe: "Restaurants & Bars",
  meal_delivery: "Restaurants & Bars",
  meal_takeaway: "Restaurants & Bars",

  // Shopping & Fashion
  clothing_store: "Shopping & Fashion",
  shoe_store: "Shopping & Fashion",
  shopping_mall: "Shopping & Fashion",
  department_store: "Shopping & Fashion",
  jewelry_store: "Shopping & Fashion",

  // Sports
  gym: "Sports",
  stadium: "Sports",

  // Travel & Vacation
  travel_agency: "Travel & Vacation",
  lodging: "Travel & Vacation",
  hotel: "Travel & Vacation",

  // Utilities
  gas_station: "Utilities",

  // Vehicles & Transportation
  car_dealer: "Vehicles & Transportation",
  car_rental: "Vehicles & Transportation",
  car_repair: "Vehicles & Transportation",
  car_wash: "Vehicles & Transportation",

  // Fintech & Mobile Money
  // (no direct Google type — matched by keyword in name)

  // Telecommunications
  // (no direct Google type — matched by keyword in name)

  // Logistics & Delivery
  post_office: "Logistics & Delivery",
  transit_station: "Logistics & Delivery",

  // Agriculture & Agritech
  // (no direct Google type — matched by keyword)
};

// Keyword-based fallback for companies Google doesn't categorize well
const KEYWORD_TO_CATEGORY = {
  "telecom": "Telecommunications",
  "mobile money": "Fintech & Mobile Money",
  "fintech": "Fintech & Mobile Money",
  "mpesa": "Fintech & Mobile Money",
  "m-pesa": "Fintech & Mobile Money",
  "airtel money": "Fintech & Mobile Money",
  "mtn money": "Fintech & Mobile Money",
  "logistics": "Logistics & Delivery",
  "delivery": "Logistics & Delivery",
  "courier": "Logistics & Delivery",
  "farming": "Agriculture & Agritech",
  "agri": "Agriculture & Agritech",
  "real estate": "Real Estate & Property",
  "property": "Real Estate & Property",
};

/**
 * Figure out which of our categories a Google Place belongs to
 */
function mapGoogleToCategory(googleTypes = [], placeName = "") {
  // 1. Try direct type mapping
  for (const type of googleTypes) {
    if (GOOGLE_TYPE_TO_CATEGORY[type]) {
      return GOOGLE_TYPE_TO_CATEGORY[type];
    }
  }

  // 2. Try keyword matching on the business name
  const lowerName = placeName.toLowerCase();
  for (const [keyword, category] of Object.entries(KEYWORD_TO_CATEGORY)) {
    if (lowerName.includes(keyword)) {
      return category;
    }
  }

  // 3. Default to Business Services
  return FALLBACK_CATEGORY;
}

// Every category name this importer can produce. Only these are created
// automatically, so imports can never invent arbitrary categories.
const KNOWN_CATEGORIES = new Set([
  ...Object.values(GOOGLE_TYPE_TO_CATEGORY),
  ...Object.values(KEYWORD_TO_CATEGORY),
  FALLBACK_CATEGORY,
]);

/**
 * Find a category by name, creating it if it's one of our known categories.
 * Returns null for unknown names.
 */
async function findOrCreateCategory(name) {
  const existing = await Category.findOne({ name });
  if (existing || !KNOWN_CATEGORIES.has(name)) return existing;
  try {
    return await Category.create({ name });
  } catch (err) {
    // Another import created it at the same moment
    if (err.code === 11000) return Category.findOne({ name });
    throw err;
  }
}

class ImportSkipError extends Error {
  // extra: safe fields added to the API error response (e.g. companySlug)
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = "ImportSkipError";
    this.status = status;
    this.extra = extra;
  }
}

/**
 * Fetch a place from Google and save it as a company.
 * Throws ImportSkipError when the place can't or shouldn't be imported.
 * fallbackCountry is used when Google's address has no country.
 */
async function importPlaceAsCompany(placeId, { categoryOverride, fallbackCountry = "" } = {}) {
  const existing = await Company.findOne({ googlePlaceId: placeId });
  if (existing) {
    throw new ImportSkipError("Company already imported", 409, { companySlug: existing.slug });
  }

  const place = await getPlaceForImport(placeId);
  if (!place.name) throw new ImportSkipError("Google returned no name for this place");

  const categoryName = categoryOverride || mapGoogleToCategory(place.types, place.name);
  const category = await findOrCreateCategory(categoryName);
  if (!category) throw new ImportSkipError(`Category "${categoryName}" not found in our DB`);

  try {
    return await Company.create({
      name: place.name,
      url: place.website,
      description: place.address ? `${place.name} located at ${place.address}` : place.name,
      category: category._id,
      googlePlaceId: place.placeId,
      address: place.address,
      phone: place.phone,
      country: place.country || fallbackCountry,
      city: place.city,
      source: "google",
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ImportSkipError("A company with this name already exists in this city", 409);
    }
    throw err;
  }
}

module.exports = { mapGoogleToCategory, importPlaceAsCompany, ImportSkipError, KNOWN_CATEGORIES };
