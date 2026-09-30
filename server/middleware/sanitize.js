/**
 * NoSQL Injection Protection Middleware (Express 5 compatible)
 *
 * Recursively strips keys starting with "$" from req.body.
 * This prevents attackers from injecting MongoDB operators
 * like $gt, $ne, $in through POST/PUT request bodies.
 *
 * Query string injection is handled separately by setting
 * the Express query parser to "simple" (see server.js).
 */

function stripDollarKeys(obj) {
  if (Array.isArray(obj)) {
    obj.forEach((item) => stripDollarKeys(item));
  } else if (obj !== null && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      if (key.startsWith("$")) {
        delete obj[key];
      } else {
        stripDollarKeys(obj[key]);
      }
    }
  }
  return obj;
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    stripDollarKeys(req.body);
  }
  next();
}

module.exports = sanitizeBody;
