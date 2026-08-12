require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Menu = require('../models/Menu');

// Dish items that reference images already present in backend/uploads/
const MENU_ITEMS = [
  {
    name: 'Gujarati Thali',
    description:
      'A wholesome traditional Gujarati platter — dal, rice, roti, shaak, farsan, and a sweet treat.',
    price: 12.99,
    category: 'Main',
    image: 'gujratithali.png',
    available: true,
    premium: true,
    dietary: ['Vegetarian'],
    tags: ['thali', 'traditional', 'gujarati'],
  },
  {
    name: 'Punjabi Thali',
    description:
      'A rich Punjabi spread with butter paneer, dal makhani, naan, jeera rice, and salad.',
    price: 14.99,
    category: 'Main',
    image: 'panjabi thali.jpg',
    available: true,
    premium: true,
    dietary: ['Vegetarian'],
    tags: ['thali', 'punjabi', 'paneer'],
  },
  {
    name: 'Punjabi Thali Deluxe',
    description:
      'An upgraded Punjabi feast with extra sides, tandoori bread, and a signature dessert.',
    price: 17.99,
    category: 'Main',
    image: 'panjabi thali1.jpg',
    available: true,
    premium: true,
    dietary: ['Vegetarian'],
    tags: ['thali', 'punjabi', 'deluxe'],
  },
  {
    name: 'Punjabi Thali Special',
    description:
      'A generous Punjabi platter featuring a variety of curries, breads, and rice.',
    price: 13.99,
    category: 'Main',
    image: 'panjabi thali.jfif',
    available: true,
    premium: false,
    dietary: ['Vegetarian'],
    tags: ['thali', 'punjabi'],
  },
];

async function seedMenu() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MONGO_URI not set in .env file');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('☘️ Connected to MongoDB');

    let added = 0;
    let skipped = 0;

    for (const item of MENU_ITEMS) {
      const existing = await Menu.findOne({ name: item.name });
      if (existing) {
        // Update image if it's currently missing
        if (!existing.image && item.image) {
          existing.image = item.image;
          await existing.save();
          console.log(`🔄 Updated image for "${item.name}"`);
        } else {
          skipped++;
        }
        continue;
      }
      await new Menu(item).save();
      added++;
      console.log(`✅ Added "${item.name}"`);
    }

    console.log(`\nDone. Added: ${added}, Skipped/existing: ${skipped}`);
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

seedMenu();
