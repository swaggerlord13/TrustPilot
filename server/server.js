const express = require("express");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const cors = require("cors");

const connectDB = require("./config/db");
const sanitizeBody = require("./middleware/sanitize");
const authRoutes = require("./Routes/authRoutes");
const reviewRoutes = require("./Routes/reviewRoutes");
const categoryRoutes = require("./Routes/categoryRoutes");
const subCategoryRoutes = require("./Routes/subcategoryRoutes");
const companyRoutes = require("./Routes/companyRoutes");
const uploadRoutes = require("./Routes/uploadRoutes");
const googleRoutes = require("./Routes/googleRoutes");
const companyClaimRoutes = require("./Routes/companyClaimRoutes");
const companyDashboardRoutes = require("./Routes/companyDashboardRoutes");
const adminRoutes = require("./Routes/adminRoutes");

// Load env vars
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize app
const app = express();

// Trust first proxy (Render's load balancer). Needed for express-rate-limit
app.set("trust proxy", 1);

// Use Node's built-in query parser to prevent NoSQL injection via URL params.
// The default "extended" parser (qs) converts ?age[$gt]=5 into { age: { $gt: "5" } },
// which attackers can use to inject MongoDB operators. The "simple" parser treats
// bracket syntax as plain text, keeping query values flat and safe.
app.set("query parser", "simple");

// ========================
// SECURITY MIDDLEWARE
// ========================

// Set security HTTP headers (protects against XSS, clickjacking, etc.)
app.use(helmet());

// Rate limiting: max 500 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limit for auth routes (login, register, forgot-password)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: "Too many login attempts, please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general limiter to all routes
app.use(generalLimiter);

// Parse JSON (with a size limit to prevent huge payloads)
app.use(express.json({ limit: "10kb" }));

// Strip MongoDB operators ($gt, $ne, etc.) from request bodies.
// This is the Express 5 best practice — sanitize input at the middleware layer
// without breaking server-side queries that legitimately use operators.
app.use(sanitizeBody);

// CORS: allow your frontend origins (not wide-open "*")
const allowedOrigins = [
  "http://localhost:5173",       // Vite dev server
  "http://localhost:3000",       // alt dev
  process.env.FRONTEND_URL,      // production frontend URL (set in .env)
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ========================
// ROUTES
// ========================

// Health check
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Auth routes get the stricter rate limiter
app.use("/api/auth", authLimiter, authRoutes);

app.use("/api/reviews", reviewRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subCategoryRoutes);
app.use("/api/companies", companyRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/company-claims", companyClaimRoutes);
app.use("/api/company-dashboard", companyDashboardRoutes);
app.use("/api/admin", adminRoutes);

// ========================
// GLOBAL ERROR HANDLER
// ========================
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Something went wrong"
      : err.message,
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
