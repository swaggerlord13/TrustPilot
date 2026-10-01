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

module.exports = { asText, asPassword, isValidEmail };
