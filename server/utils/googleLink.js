/**
 * Link existing companies (added by hand, before the Google importer) to
 * their Google place, so their page shows the live Google rating/reviews.
 *
 * Linking stores the place ID and only fills EMPTY website/address/phone.
 * It never changes name, city or country: those build the company slug,
 * and changing them would break existing company URLs.
 */

const Company = require("../models/Company");
const { searchText, getPlaceForImport } = require("./googlePlaces");
const { ImportSkipError } = require("./googleImport");

// Words that don't help tell businesses apart
const NAME_STOPWORDS = new Set([
  "the", "and", "of", "ltd", "limited", "plc", "inc", "llc", "co", "company",
  "group", "holdings", "nig", "int", "international",
]);

function nameTokens(name = "") {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NAME_STOPWORDS.has(t));
}

/**
 * Strict 0..1 similarity used to auto-link: shared words relative to the
 * LONGER name, ignoring the company's own city/country words (so
 * "MTN" vs "MTN Nigeria" is 1, but "Jumia" vs "Jumia Food Pickup" is low).
 */
function strictNameSimilarity(company, placeName) {
  const ignore = new Set(nameTokens([company.city, company.country].filter(Boolean).join(" ")));
  const ta = new Set(nameTokens(company.name).filter((t) => !ignore.has(t)));
  const tb = new Set(nameTokens(placeName).filter((t) => !ignore.has(t)));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

/**
 * 0..1 similarity between two business names (token overlap), lenient:
 * used to rank candidates, not to decide on its own.
 */
function nameSimilarity(a, b) {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  // Overlap relative to the shorter name, so "MTN" vs "MTN Nigeria" scores high
  return shared / Math.min(ta.size, tb.size);
}

function domainOf(url) {
  if (!url) return "";
  try {
    const withScheme = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Shown to admins as a hint: does the address mention our city (or, if
// we have no city, our country)?
function locationMatches(company, address = "") {
  const haystack = address.toLowerCase();
  const place = (company.city || company.country || "").toLowerCase();
  return place ? haystack.includes(place) : false;
}

// Strong enough to auto-link without a website: the city must match
function cityMatches(company, address = "") {
  return Boolean(company.city) && address.toLowerCase().includes(company.city.toLowerCase());
}

function searchQueryFor(company) {
  return [company.name, company.city, company.country].filter(Boolean).join(" ");
}

/**
 * Google search results for a company, best name match first.
 */
async function findCandidates(company, { maxResults = 5 } = {}) {
  const places = await searchText(searchQueryFor(company), { maxResults });
  return places
    .map((place) => ({
      ...place,
      nameScore: Math.round(nameSimilarity(company.name, place.name) * 100) / 100,
      locationMatch: locationMatches(company, place.address),
    }))
    .sort((a, b) => b.nameScore - a.nameScore);
}

/**
 * Decide automatically whether the best candidate is the same business.
 * Returns { status: "confident" | "uncertain" | "none", candidate, details, reason }.
 * Costs one search, plus one place lookup when there is a plausible candidate.
 */
async function findConfidentMatch(company) {
  const candidates = await findCandidates(company);
  const best = candidates[0];
  if (!best || best.nameScore < 0.6) {
    return { status: "none", reason: "no similar name on Google" };
  }

  const details = await getPlaceForImport(best.placeId);
  const ourDomain = company.domain || domainOf(company.url);
  const googleDomain = domainOf(details.website);

  if (ourDomain && googleDomain && ourDomain === googleDomain) {
    return { status: "confident", candidate: best, details, reason: "website matches" };
  }
  if (ourDomain && googleDomain && ourDomain !== googleDomain) {
    return { status: "uncertain", candidate: best, details, reason: `website differs (${googleDomain})` };
  }
  // No website to compare: require a near-identical name AND the same city
  const strictScore = strictNameSimilarity(company, best.name);
  if (strictScore >= 0.8 && cityMatches(company, details.address || best.address)) {
    return { status: "confident", candidate: best, details, reason: "name and city match" };
  }
  let reason = "name only partly matches";
  if (!company.city) reason = "no city on our company to confirm";
  else if (!cityMatches(company, details.address || best.address)) reason = "city doesn't match";
  return { status: "uncertain", candidate: best, details, reason };
}

/**
 * Store the place ID on the company and fill empty website/address/phone.
 * Pass `details` from getPlaceForImport to avoid a second lookup.
 */
const FILLABLE_FIELDS = { url: "website", address: "address", phone: "phone" };

function alreadyLinkedError(other) {
  return new ImportSkipError(`This Google place is already linked to "${other.name}"`, 409, {
    companySlug: other.slug,
  });
}

async function linkCompanyToPlace(companyId, placeId, details = null) {
  const company = await Company.findById(companyId);
  if (!company) throw new ImportSkipError("Company not found", 404);

  const place = details || (await getPlaceForImport(placeId));
  // Google may return an updated ID for an old one; check both
  const ids = [...new Set([placeId, place.placeId])];
  const other = await Company.findOne({ googlePlaceId: { $in: ids }, _id: { $ne: company._id } })
    .select("name slug")
    .lean();
  if (other) throw alreadyLinkedError(other);

  // Clear anything a previous link filled in before filling again
  for (const field of company.googleFilledFields || []) company[field] = "";

  const filled = [];
  for (const [field, placeField] of Object.entries(FILLABLE_FIELDS)) {
    if (!company[field] && place[placeField]) {
      company[field] = place[placeField];
      filled.push(field);
    }
  }
  company.googlePlaceId = place.placeId;
  company.googleFilledFields = filled.length ? filled : undefined;
  await company.save();

  // Two links to the same place at the same moment both pass the check
  // above. Both then see each other here; the company with the lower _id
  // keeps the link and the other one undoes its own, so exactly one stays.
  const racer = await Company.findOne({ googlePlaceId: place.placeId, _id: { $ne: company._id } })
    .select("name slug _id")
    .lean();
  if (racer && String(racer._id) < String(company._id)) {
    await clearGoogleLink(company);
    throw alreadyLinkedError(racer);
  }
  return company;
}

// Remove the link and exactly the fields the link filled in
async function clearGoogleLink(company) {
  for (const field of company.googleFilledFields || []) company[field] = "";
  company.googlePlaceId = undefined;
  company.googleFilledFields = undefined;
  await company.save();
  return company;
}

async function unlinkCompany(companyId) {
  const company = await Company.findById(companyId);
  if (!company) throw new ImportSkipError("Company not found", 404);
  return clearGoogleLink(company);
}

module.exports = {
  nameSimilarity,
  strictNameSimilarity,
  domainOf,
  findCandidates,
  findConfidentMatch,
  linkCompanyToPlace,
  unlinkCompany,
};
