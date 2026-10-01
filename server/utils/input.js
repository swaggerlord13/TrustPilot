/**
 * Small helpers for reading values from requests safely.
 * Anything that isn't plain text (an object like {"$ne": null}, an array, a
 * number) is treated as empty, so it can never be used as a database query
 * operator to match someone else's data.
 */

// Trimmed text, or "" for anything that isn't a string. `max` cuts long input.
function asText(value, max = Infinity) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Passwords are taken exactly as typed (spaces count), or "" if not a string
function asPassword(value) {
  return typeof value === "string" ? value : "";
}

// Simple "something@something.something" check, enough to catch typos
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Turn a website/logo value into a safe http(s) URL string, "" for empty,
 * or null when it is not a valid http(s) URL (blocks "javascript:" links).
 */
function normalizeHttpUrl(value) {
  // Missing or blank means "no URL"
  if (value === undefined || value === null || String(value).trim() === "") return "";
  // Trimmed text form
  const text = String(value).trim();
  try {
    // Allow "mtn.ng" by assuming https
    // A scheme like "https:" or "javascript:" (but "host:8080" is a port, not a scheme)
    const url = new URL(/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text) ? text : `https://${text}`);
    // Only web links are allowed
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // A real host: a name with a dot ("acme.com", not "N" from "N/A" or
    // "uploads" from "/uploads/x.png"), and no user:password@ part
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    // Not parseable as a URL
    return null;
  }
}

module.exports = { asText, asPassword, isValidEmail, normalizeHttpUrl };
