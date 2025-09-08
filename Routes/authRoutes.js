const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();

// Helper function to generate token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, profileImage } = req.body;

    // Check if email OR username already exists
    const userExists = await User.findOne({
      $or: [{ email }],
    });

    if (userExists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      profileImage,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      token: generateToken(user._id), // return JWT
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user & get token
 * @access  Public
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid email or password" });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// in authRoutes.js (after register & login)
const { protect } = require("../middleware/authMiddleware");

/**
 * @route   GET /api/auth/me
 * @desc    Get logged-in user profile
 * @access  Private
 */
router.get("/me", protect, async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    profileImage: req.user.profileImage,
  });
});

/**
 * @route   PUT /api/auth/me
 * @desc    Update logged-in user profile
 * @access  Private
 */
router.put("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update fields if provided
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.profileImage = req.body.profileImage || user.profileImage;

    // If password provided, update it
    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      profileImage: updatedUser.profileImage,
      token: generateToken(updatedUser._id), // refresh token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
