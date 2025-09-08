// Create a new file: routes/uploadRoutes.js

const express = require("express");
const router = express.Router();
const {
  uploadCompanyLogo,
  uploadUserProfile,
} = require("../middleware/imageUpload");
const { protect } = require("../middleware/authMiddleware"); // Assuming you have auth middleware

// Upload company logo
router.post(
  "/company-logo",
  uploadCompanyLogo.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const imageUrl = req.file.path; // Cloudinary URL

      res.json({
        success: true,
        imageUrl: imageUrl,
        message: "Company logo uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading company logo:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

// Upload user profile image
router.post(
  "/user-profile",
  protect,
  uploadUserProfile.single("profileImage"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const imageUrl = req.file.path; // Cloudinary URL

      res.json({
        success: true,
        imageUrl: imageUrl,
        message: "Profile image uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading profile image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  }
);

// Delete image from Cloudinary (optional)
router.delete("/delete-image", async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res.status(400).json({ error: "Public ID is required" });
    }

    const { cloudinary } = require("../middleware/imageUpload");
    const result = await cloudinary.uploader.destroy(publicId);

    res.json({
      success: true,
      result: result,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

module.exports = router;
