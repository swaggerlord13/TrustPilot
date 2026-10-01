const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Require a valid login. Sets req.user (without the password) or answers 401.
 */
const protect = async (req, res, next) => {
  // "Authorization: Bearer <token>"
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized, no token" });
  }
  // Token text after "Bearer "
  const token = header.slice(7).trim();

  // Check the signature and expiry
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Not authorized, token failed" });
  }

  // Load the account the token belongs to
  let user;
  try {
    user = await User.findById(decoded.id).select("-password");
  } catch (err) {
    // Malformed id inside a validly signed token: treat as a bad token
    if (err.name === "CastError") return res.status(401).json({ error: "Not authorized, token failed" });
    // Database trouble is not the user's fault: don't log them out for it
    console.error("Auth lookup error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }

  // Token is valid but the account was deleted: treat as logged out
  if (!user) {
    return res.status(401).json({ error: "Not authorized, user not found" });
  }

  // Signed out everywhere since this token was made (password changed/reset).
  // Tokens from before this check existed have no "v" and count as version 0.
  if ((decoded.v || 0) !== (user.tokenVersion || 0)) {
    return res.status(401).json({ error: "Your session has ended. Please log in again." });
  }

  // Logged in: continue (outside any try, so later errors aren't reported as 401)
  req.user = user;
  next();
};

/**
 * Require a verified email address (use after protect). Stops accounts made
 * with fake or someone else's email from posting reviews or claiming businesses.
 */
const requireVerified = (req, res, next) => {
  if (!req.user?.isEmailVerified) {
    return res.status(403).json({
      error: "Please verify your email address first. Check your inbox for the link, or request a new one from the login page.",
      needsVerification: true,
    });
  }
  next();
};

module.exports = { protect, requireVerified };
