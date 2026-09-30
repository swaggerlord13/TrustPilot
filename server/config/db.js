const mongoose = require("mongoose");

// Enable built-in NoSQL injection protection (Mongoose 8+)
// Wraps user-provided query values in $eq, neutralizing $gt/$ne injection attempts
mongoose.set("sanitizeFilter", true);

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1); // Exit process if DB fails
  }
};

module.exports = connectDB;
