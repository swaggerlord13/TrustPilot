/**
 * Google Places API (New) helpers.
 *
 * - Uses places.googleapis.com/v1 (the legacy maps/api/place endpoints
 *   cannot be enabled on projects created after March 2025).
 * - The API key is sent in a header only. It must never end up in a URL
 *   that is stored in the DB or sent to browsers.
 * - Field masks keep each request in the cheapest billing tier that has
 *   the fields we need.
 * - Google's terms only allow the place ID to be stored long term, so
 *   ratings/reviews are fetched live (see getPlaceReviews) and only kept
 *   in a short in-memory cache.
 */

const PLACES_BASE_URL = "https://places.googleapis.com/v1";
const REQUEST_TIMEOUT_MS = 10000;

// Text Search fields (Pro tier): enough for an admin to pick results
const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.types",
].join(",");

// Place Details fields used to create a company listing
const IMPORT_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "types",
  "websiteUri",
  "nationalPhoneNumber",
].join(",");

// Place Details fields shown live on the company page
const REVIEWS_FIELD_MASK = ["rating", "userRatingCount", "reviews", "googleMapsUri"].join(",");

const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{10,300}$/;

class GooglePlacesError extends Error {
  // status: what our API returns; googleStatus: Google's own HTTP status
  // (e.g. 429 when a quota or daily limit is reached)
  constructor(message, status, googleStatus = null) {
    super(message);
    this.name = "GooglePlacesError";
    this.status = status;
    this.googleStatus = googleStatus;
  }
}

function isValidPlaceId(placeId) {
  return typeof placeId === "string" && PLACE_ID_PATTERN.test(placeId);
}

function getApiKey() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new GooglePlacesError("Google Places API key not configured", 500);
  }
  return apiKey;
}

async function placesRequest(path, { method = "GET", fieldMask, body } = {}) {
  const res = await fetch(`${PLACES_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": fieldMask,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message || `Google Places request failed (${res.status})`;
    throw new GooglePlacesError(message, res.status === 404 ? 404 : 502, res.status);
  }
  return data;
}

/**
 * Search for businesses by free text, e.g. "banks in Lagos".
 */
async function searchText(textQuery, { maxResults = 20 } = {}) {
  const data = await placesRequest("/places:searchText", {
    method: "POST",
    fieldMask: SEARCH_FIELD_MASK,
    body: { textQuery, pageSize: Math.min(Math.max(maxResults, 1), 20) },
  });
  return (data.places || []).map((place) => ({
    placeId: place.id,
    name: place.displayName?.text || "",
    address: place.formattedAddress || "",
    types: place.types || [],
  }));
}

/**
 * Details needed to create a company listing from a place.
 */
async function getPlaceForImport(placeId) {
  if (!isValidPlaceId(placeId)) throw new GooglePlacesError("Invalid place ID", 400);
  const place = await placesRequest(`/places/${encodeURIComponent(placeId)}`, {
    fieldMask: IMPORT_FIELD_MASK,
  });
  const { city, country } = extractLocation(place.addressComponents);
  return {
    placeId: place.id,
    name: place.displayName?.text || "",
    address: place.formattedAddress || "",
    types: place.types || [],
    website: place.websiteUri || "",
    phone: place.nationalPhoneNumber || "",
    city,
    country,
  };
}

/**
 * Extract city and country from Places API (New) address components.
 */
function extractLocation(addressComponents = []) {
  let city = "";
  let country = "";
  for (const comp of addressComponents) {
    const types = comp.types || [];
    if (types.includes("locality")) city = comp.longText || "";
    if (types.includes("country")) country = comp.longText || "";
  }
  return { city, country };
}

// ── Live reviews with a short in-memory cache ─────────────────

const REVIEWS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REVIEWS_ERROR_TTL_MS = 10 * 60 * 1000; // back off 10 minutes after a failure
const REVIEWS_CACHE_MAX_ENTRIES = 1000;
const reviewsCache = new Map(); // placeId -> { expiresAt, value?, error? }
const inFlight = new Map(); // placeId -> Promise

function formatReviews(place) {
  return {
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? 0,
    googleMapsUri: place.googleMapsUri || "",
    // Google picks the 5 "most relevant" reviews and Places API (New) has no
    // sort option, so show the newest of those first
    reviews: [...(place.reviews || [])]
      .sort((a, b) => (Date.parse(b.publishTime) || 0) - (Date.parse(a.publishTime) || 0))
      .map((review) => ({
        authorName: review.authorAttribution?.displayName || "Google user",
        authorUri: review.authorAttribution?.uri || "",
        authorPhotoUri: review.authorAttribution?.photoUri || "",
        rating: review.rating ?? null,
        text: review.text?.text || review.originalText?.text || "",
        relativePublishTimeDescription: review.relativePublishTimeDescription || "",
        publishTime: review.publishTime || null,
        googleMapsUri: review.googleMapsUri || "",
      })),
  };
}

function cacheSet(placeId, entry) {
  // Map keeps insertion order, so the first key is the oldest entry
  if (reviewsCache.size >= REVIEWS_CACHE_MAX_ENTRIES && !reviewsCache.has(placeId)) {
    reviewsCache.delete(reviewsCache.keys().next().value);
  }
  reviewsCache.set(placeId, entry);
}

/**
 * Rating, review count and up to 5 reviews for a place, fetched live.
 * Concurrent requests for the same place share one Google call.
 */
async function getPlaceReviews(placeId) {
  if (!isValidPlaceId(placeId)) throw new GooglePlacesError("Invalid place ID", 400);

  const cached = reviewsCache.get(placeId);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.error) throw cached.error;
    return cached.value;
  }
  if (inFlight.has(placeId)) return inFlight.get(placeId);

  const request = placesRequest(`/places/${encodeURIComponent(placeId)}`, {
    fieldMask: REVIEWS_FIELD_MASK,
  })
    .then((place) => {
      const value = formatReviews(place);
      cacheSet(placeId, { value, expiresAt: Date.now() + REVIEWS_CACHE_TTL_MS });
      return value;
    })
    .catch((err) => {
      const error = err instanceof GooglePlacesError ? err : new GooglePlacesError(err.message, 502);
      cacheSet(placeId, { error, expiresAt: Date.now() + REVIEWS_ERROR_TTL_MS });
      throw error;
    })
    .finally(() => inFlight.delete(placeId));

  inFlight.set(placeId, request);
  return request;
}

module.exports = {
  GooglePlacesError,
  isValidPlaceId,
  searchText,
  getPlaceForImport,
  getPlaceReviews,
  extractLocation,
  // exported for tests
  _reviewsCache: reviewsCache,
};
