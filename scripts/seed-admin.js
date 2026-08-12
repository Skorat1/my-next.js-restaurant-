

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

async function seedAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI not set in .env file');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('☘️ Connected to MongoDB');

    // Check if admin already exists
    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      if (existing.role !== 'admin') {
        existing.role = 'admin';
        await existing.save();
        console.log(`✅ User ${ADMIN_EMAIL} promoted to admin role.`);
      } else {
        console.log(`ℹ️  Admin user ${ADMIN_EMAIL} already exists.`);
      }
      await mongoose.disconnect();
      return;
    }

    // Create admin user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

    const admin = new User({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
    });

    await admin.save();
    console.log(`✅ Admin account created successfully!`);
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: (as set in ADMIN_PASSWORD env var)`);
    console.log(`   Role: admin`);

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

seedAdmin();
