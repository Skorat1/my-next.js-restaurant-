const express = require('express');
const router = express.Router();
const Media = require('../models/Media');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Seed default media items if database is empty
const DEFAULT_MEDIA = [
  {
    title: "Masterclass: The Secrets of 72-Hour Binchotan Charcoal Wagyu",
    description: "Executive Chef Antoine Laurent demonstrates classic French sear techniques using Japanese white Binchotan oak charcoal, truffle reduction, and 24K gold leaf finish.",
    type: "video",
    category: "Masterclass",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    thumbnail: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80",
    duration: "24:15",
    views: 14200,
    likes: 1240,
    host: "Chef Antoine Laurent",
    tags: ["Wagyu", "Masterclass", "Binchotan", "Steak"],
    isFeatured: true,
  },
  {
    title: "LIVE: Evening Service Kitchen Cam — Open Kitchen Prep",
    description: "Real-time broadcast directly from L'Étoile Dorée open kitchen line during peak evening dinner service.",
    type: "livestream",
    category: "Live Kitchen",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    thumbnail: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=80",
    duration: "LIVE",
    views: 890,
    likes: 420,
    host: "Culinary Line Team",
    tags: ["Live", "Kitchen Cam", "Dinner Service"],
    isLive: true,
  },
  {
    title: "Podcast Ep. 18: Decanting 1982 Bordeaux Grand Crus",
    description: "Head Sommelier Jean-Luc discusses vintage aeration techniques, cellar temperature balance, and pairing high-tannin Bordeaux with aged game meats.",
    type: "podcast",
    category: "Sommelier Vault",
    audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    thumbnail: "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=80",
    duration: "38:20",
    views: 8400,
    likes: 710,
    host: "Jean-Luc Moreau (Master Sommelier)",
    tags: ["Wine", "Bordeaux", "Sommelier", "Podcast"],
  },
  {
    title: "Documentary: Farm to Table — Sourcing Organic Herbs in Maharashtra",
    description: "Follow our culinary team to biodynamic micro-farms in the Sahyadri mountains harvesting wild fennel, edible pansies, and heirloom radishes.",
    type: "video",
    category: "Chef Series",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    thumbnail: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80",
    duration: "18:40",
    views: 11300,
    likes: 980,
    host: "Chef Antoine & Organic Farmers",
    tags: ["Documentary", "Organic", "Sustainability"],
  },
  {
    title: "Artisanal Soufflé Mechanics: Achieving 3-Inch Uniform Rise",
    description: "Pastry Chef Pierre reveals the chemistry behind stiff egg whites, Valrhona 70% Guanaja chocolate emulsion, and ramekin sugar lining.",
    type: "video",
    category: "Masterclass",
    videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    thumbnail: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=1200&q=80",
    duration: "16:05",
    views: 9500,
    likes: 850,
    host: "Chef Pierre Valois",
    tags: ["Pastry", "Souffle", "Dessert", "Chocolate"],
  },
  {
    title: "Food Journalism: The Evolution of Modern French Gastronomy in India",
    description: "An in-depth editorial exploring how classical French sauces are reimagined using local Indian botanicals, indigenous spices, and Himalayan salt aging.",
    type: "article",
    category: "Food Journalism",
    thumbnail: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    duration: "8 min read",
    views: 6200,
    likes: 540,
    host: "Étoile Magazine Editorial",
    tags: ["Journalism", "French Cuisine", "Article"],
  },
];

// GET /api/media — list media with filters
router.get('/', async (req, res) => {
  try {
    const count = await Media.countDocuments();
    if (count === 0) {
      await Media.insertMany(DEFAULT_MEDIA);
    }

    const { type, category, q } = req.query;
    const filter = {};

    if (type && type !== 'all') filter.type = type;
    if (category && category !== 'All') filter.category = category;
    if (q) filter.$text = { $search: q };

    const items = await Media.find(filter).sort({ isFeatured: -1, isLive: -1, createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error('GET /api/media error:', err);
    res.status(500).json({ msg: 'Server error fetching media' });
  }
});

// GET /api/media/featured — get featured or live item
router.get('/featured', async (req, res) => {
  try {
    let item = await Media.findOne({ isLive: true });
    if (!item) item = await Media.findOne({ isFeatured: true });
    if (!item) item = await Media.findOne();
    res.json(item);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/media/:id/like — toggle like
router.post('/:id/like', async (req, res) => {
  try {
    const item = await Media.findById(req.params.id);
    if (!item) return res.status(404).json({ msg: 'Media not found' });
    item.likes += 1;
    await item.save();
    res.json({ success: true, likes: item.likes });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/media — admin create media item
router.post('/', [auth, admin], async (req, res) => {
  try {
    const item = new Media(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ msg: 'Server error creating media' });
  }
});

module.exports = router;
