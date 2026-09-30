// Admin-only middleware — must be used AFTER protect (authMiddleware)
// It checks req.user.isAdmin which gets set when protect attaches the user
const admin = (req, res, next) => {
  if (req.user && req.user.isAdmin) {
    next();
  } else {
    return res.status(403).json({ error: "Access denied. Admin only." });
  }
};

module.exports = { admin };
