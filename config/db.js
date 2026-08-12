const mongoose = require('mongoose');
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('☘️ MongoDB Connected Successfully');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    // In dev keep server running to inspect errors; do not exit process here.
  }
};
module.exports = connectDB;