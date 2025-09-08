const mongoose = require("mongoose");

// Function to connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true, // Required for new MongoDB drivers
      useUnifiedTopology: true, // Better server discovery
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1); // Exit process if DB fails
  }
};

module.exports = connectDB;
