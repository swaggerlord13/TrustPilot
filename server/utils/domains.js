/**
 * One place for reading website domains, used by companies, brands and the
 * Google import/link code so they always agree.
 */

// Sites many unrelated businesses use as their "website". A domain on (or
// under) one of these never identifies a brand, so we never match by it.
const SHARED_DOMAINS = [
  "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com",
  "linkedin.com", "tiktok.com", "youtube.com", "youtu.be", "wa.me",
  "whatsapp.com", "linktr.ee", "google.com", "goo.gl", "business.site",
  "blogspot.com", "wordpress.com", "wixsite.com", "weebly.com", "square.site",
  "jumia.com.ng", "konga.com", "jiji.ng", "bit.ly",
];

/**
 * Root domain of a URL without "www.", lower-cased, or null if unparseable.
 * "https://www.MTN.ng/about" -> "mtn.ng"
 */
function extractDomain(url) {
  // Nothing to parse
  if (!url || typeof url !== "string") return null;
  try {
    // Add a scheme when missing so URL() can parse "mtn.ng"
    const withScheme = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    // Host name, lower-cased, without a leading "www."
    const host = new URL(withScheme).hostname.toLowerCase().replace(/^www\./, "");
    // A real domain has at least one dot
    return host.includes(".") ? host : null;
  } catch {
    // Not a valid URL
    return null;
  }
}

/**
 * True when the domain is, or is under, a shared site like facebook.com
 * (so "web.facebook.com" and "m.facebook.com" count too).
 */
function isSharedDomain(domain) {
  // No domain is treated as "not usable" by callers, not as shared
  if (!domain) return false;
  // Exact match or a sub-domain of a shared site
  return SHARED_DOMAINS.some((shared) => domain === shared || domain.endsWith(`.${shared}`));
}

/**
 * Domain that may identify a brand: the URL's domain, unless it is missing
 * or belongs to a shared site, in which case null.
 */
function brandDomainOf(url) {
  // Parse the domain first
  const domain = extractDomain(url);
  // Shared sites never identify a brand
  return domain && !isSharedDomain(domain) ? domain : null;
}

module.exports = { SHARED_DOMAINS, extractDomain, isSharedDomain, brandDomainOf };
