// Create a new file: middleware/imageUpload.js
const dotenv = require("dotenv");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

// Load env vars
dotenv.config();

// Configure Cloudinary (add these to your .env file)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure storage for different image types
const createCloudinaryStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: folder, // e.g., 'company-logos', 'user-profiles'
      allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
      transformation: [
        { width: 400, height: 400, crop: "limit" }, // Resize to max 400x400
        { quality: "auto", fetch_format: "auto" }, // Optimize quality and format
      ],
    },
  });
};

// Create different multer instances for different image types
const uploadCompanyLogo = multer({
  storage: createCloudinaryStorage("company-logos"),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

const uploadUserProfile = multer({
  storage: createCloudinaryStorage("user-profiles"),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

module.exports = {
  uploadCompanyLogo,
  uploadUserProfile,
  cloudinary,
};
