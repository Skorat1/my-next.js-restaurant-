

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const customPassword = process.argv[2];
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@gmail.com').toLowerCase().trim();
const ADMIN_PASSWORD = customPassword || process.env.ADMIN_PASSWORD || 'Admin@123456';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

async function seedAdmin() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI not set in .env file');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('☘️ Connected to MongoDB');

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);

    const existing = await User.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      existing.role = 'admin';
      existing.password = hashedPassword;
      existing.isVerified = true;
      await existing.save();
      console.log(`✅ Admin user password updated successfully!`);
      console.log(`   Email: ${ADMIN_EMAIL}`);
      console.log(`   New Password: ${ADMIN_PASSWORD}`);
      console.log(`   Role: admin`);
    } else {
      const admin = new User({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: 'admin',
        isVerified: true,
      });

      await admin.save();
      console.log(`✅ Admin account created successfully!`);
      console.log(`   Email: ${ADMIN_EMAIL}`);
      console.log(`   Password: ${ADMIN_PASSWORD}`);
      console.log(`   Role: admin`);
    }

    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

seedAdmin();

