/**
 * One way to answer when a request fails unexpectedly.
 *
 * The real error is logged (visible in Render's logs) but never sent to the
 * browser, where it could reveal database or code details. Everyday client
 * mistakes still get a clear 400:
 *   - an id that isn't a valid id (CastError) -> "Invalid id"
 *   - a value that breaks a model rule (ValidationError) -> that rule's message
 *   - a duplicate of something unique (MongoDB 11000) -> 409 "already in use"
 * Both "error" and "message" are sent because older pages read either one.
 */
function sendServerError(res, err, context = "Request failed") {
  // A malformed id in the URL or body
  if (err && err.name === "CastError") {
    const msg = `Invalid ${err.path || "id"}`;
    return res.status(400).json({ error: msg, message: msg });
  }
  // A model rule, e.g. "Comment must be at least 10 characters long"
  if (err && err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    const msg = first?.message || "Invalid data";
    return res.status(400).json({ error: msg, message: msg });
  }
  // Unique index clash (same name/slug/email already used, or a double submit)
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    const msg = field ? `That ${field} is already in use` : "That already exists";
    return res.status(409).json({ error: msg, message: msg });
  }
  // Anything else: log the details, answer generically
  console.error(`${context}:`, err);
  const msg = "Something went wrong. Please try again later.";
  return res.status(500).json({ error: msg, message: msg });
}

module.exports = { sendServerError };
