const jwt = require("jsonwebtoken");

/**
 * Login token (JWT) for a user, valid for 30 days.
 * It carries the user's tokenVersion as "v": bumping user.tokenVersion
 * (password change/reset, account recovery) makes every older token invalid,
 * which signs the user out on all devices.
 */
function generateToken(user) {
  // id = who; v = which "generation" of logins this token belongs to
  return jwt.sign({ id: user._id, v: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
}

module.exports = { generateToken };
