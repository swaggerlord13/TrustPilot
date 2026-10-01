/**
 * Brand helpers: overall rating across a brand's locations, the location
 * list with state/city filters, and attaching a location to its brand.
 */

const mongoose = require("mongoose");
const Brand = require("../models/Brand");
const Company = require("../models/Company");
const Review = require("../models/Review");
// Shared domain rules (skips facebook.com and other shared sites)
const { brandDomainOf } = require("./domains");

// Largest page size the locations list accepts
const MAX_LOCATIONS_PAGE_SIZE = 50;

/**
 * Escape text so it can be used inside a RegExp literally.
 */
function escapeRegex(text) {
  // Prefix every regex special character with a backslash
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive exact-match filter, e.g. "lagos" matches "Lagos".
 */
function exactTextFilter(value) {
  // Anchored so "Ogun" doesn't also match "Ogunlana"
  return { $regex: new RegExp(`^${escapeRegex(value.trim())}$`, "i") };
}

/**
 * Average rating, review count and 1-5 breakdown over the given companies.
 */
async function ratingStats(companyIds) {
  // Same empty result shape the company page uses
  const empty = { avgRating: 0, reviewCount: 0, ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
  // No locations means no reviews
  if (!companyIds.length) return empty;
  // One pass: count reviews per star value across all the brand's locations
  const rows = await Review.aggregate([
    // Reviews of any of these locations
    { $match: { company: { $in: companyIds } } },
    // Count per star value (1..5)
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]);
  // Start from zeroes so missing star values still appear
  const breakdown = { ...empty.ratingBreakdown };
  // Running totals for the average
  let total = 0;
  let sum = 0;
  // Fold each star bucket into the totals
  for (const row of rows) {
    // Number of reviews with this star value
    breakdown[row._id] = row.count;
    // Total reviews so far
    total += row.count;
    // Total stars so far
    sum += row._id * row.count;
  }
  // Average rounded to one decimal, like the company page
  const avgRating = total ? Math.round((sum / total) * 10) / 10 : 0;
  // Final stats
  return { avgRating, reviewCount: total, ratingBreakdown: breakdown };
}

/**
 * Everything the brand page header needs: overall rating, number of
 * locations, and the states/cities available for filtering.
 */
async function getBrandSummary(brand) {
  // All locations of this brand, with just the fields we count by
  const locations = await Company.find({ brand: brand._id }).select("_id state city").lean();
  // Overall rating across every location's reviews
  const stats = await ratingStats(locations.map((l) => l._id));
  // Count locations per state, and the cities seen in each state
  const byState = new Map();
  // Walk every location once
  for (const loc of locations) {
    // Locations without a state are grouped under "Other"
    const state = loc.state || "Other";
    // Create the state's entry the first time we see it
    if (!byState.has(state)) byState.set(state, { state, count: 0, cities: new Set() });
    // This state's entry
    const entry = byState.get(state);
    // One more location in this state
    entry.count++;
    // Remember the city for the city filter
    if (loc.city) entry.cities.add(loc.city);
  }
  // States sorted by most locations first, cities alphabetically
  const states = [...byState.values()]
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state))
    .map((s) => ({ state: s.state, count: s.count, cities: [...s.cities].sort() }));
  // Summary for the brand page
  return { ...stats, locationCount: locations.length, states };
}

/**
 * One page of a brand's locations, optionally filtered by state and city,
 * each with its own rating and review count.
 */
async function listBrandLocations(brandId, { state, city, page = 1, limit = 20 } = {}) {
  // Only this brand's locations
  const filter = { brand: brandId };
  // "Other" means "no state recorded"
  if (state === "Other") filter.state = { $in: [null, ""] };
  // Otherwise match the state name case-insensitively
  else if (typeof state === "string" && state.trim()) filter.state = exactTextFilter(state);
  // Optional city filter
  if (typeof city === "string" && city.trim()) filter.city = exactTextFilter(city);
  // Clamp paging values to safe numbers
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = Math.min(MAX_LOCATIONS_PAGE_SIZE, Math.max(1, Number.parseInt(limit, 10) || 20));
  // Total matches (for pagination) and this page of locations, in parallel
  const [total, locations] = await Promise.all([
    // How many locations match the filters
    Company.countDocuments(filter),
    // This page, sorted by state, then city, then name
    Company.find(filter)
      .select("name slug city state country address phone logo url googlePlaceId")
      .sort({ state: 1, city: 1, name: 1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);
  // Ratings for just these locations in one query
  const ratings = await Review.aggregate([
    // Reviews of the locations on this page
    { $match: { company: { $in: locations.map((l) => l._id) } } },
    // Average and count per location
    { $group: { _id: "$company", avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
  ]);
  // Look up each location's rating by id
  const ratingById = new Map(ratings.map((r) => [String(r._id), r]));
  // Attach rating fields to every location (0 when it has no reviews yet)
  const items = locations.map((loc) => {
    // This location's rating row, if any
    const r = ratingById.get(String(loc._id));
    // Location plus rounded rating
    return {
      ...loc,
      avgRating: r ? Math.round(r.avgRating * 10) / 10 : 0,
      reviewCount: r ? r.reviewCount : 0,
    };
  });
  // Page of results plus paging info
  return {
    locations: items,
    pagination: {
      page: pageNum,
      limit: pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: pageNum * pageSize < total,
      hasPrevPage: pageNum > 1,
    },
  };
}

/**
 * Brand whose website domain matches this company's domain, or null.
 * Used to attach new or newly linked locations to their brand automatically.
 */
async function findBrandForDomain(domain) {
  // Only domains that can identify a brand (not facebook.com and the like)
  const brandDomain = brandDomainOf(domain);
  // No usable domain, nothing to match
  if (!brandDomain) return null;
  // Exact domain match, e.g. "mtn.ng"
  return Brand.findOne({ domain: brandDomain }).select("_id").lean();
}

/**
 * True for a valid MongoDB ObjectId string.
 */
function isValidId(id) {
  // Mongoose's own check, so routes reject bad ids with 400 instead of crashing
  return mongoose.Types.ObjectId.isValid(id);
}

module.exports = {
  MAX_LOCATIONS_PAGE_SIZE,
  escapeRegex,
  ratingStats,
  getBrandSummary,
  listBrandLocations,
  findBrandForDomain,
  isValidId,
};
