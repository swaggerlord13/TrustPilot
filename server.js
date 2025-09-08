const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const authRoutes = require("./Routes/authRoutes"); // <-- bring in auth routes
const reviewRoutes = require("./Routes/reviewRoutes");
const categoryRoutes = require("./Routes/categoryRoutes");
const subCategoryRoutes = require("./Routes/subcategoryRoutes");
const companyRoutes = require("./Routes/companyRoutes");
// Add this import
const uploadRoutes = require("./Routes/uploadRoutes");

const cors = require("cors");

// Load env vars
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize app
const app = express();

// Middleware to parse JSON requests
app.use(express.json());

// allow frontend requests
app.use(
  cors({
    origin: "*", // frontend dev URL
    credentials: true,
  })
);

// Mount routes
app.use("/api/auth", authRoutes); // <-- THIS is critical

// Test route (optional)
app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/reviews", reviewRoutes);
//Reviews Routes

// Add this route
app.use("/api/upload", uploadRoutes);
// Routes

// ✅ Register routes
app.use("/api/categories", categoryRoutes);
app.use("/api/subcategories", subCategoryRoutes);
app.use("/api/companies", companyRoutes);

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

