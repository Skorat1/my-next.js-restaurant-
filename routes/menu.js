const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Menu = require('../models/Menu');
const Review = require('../models/Review');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// ── Multer config — save uploaded menu images to backend/uploads
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeName = file.originalname
      .replace(/\.[^.]+$/, '')       // strip original extension
      .replace(/[^a-z0-9]+/gi, '-')  // spaces & special chars → dashes
      .replace(/^-+|-+$/g, '')       // trim dashes
      .toLowerCase();
    const base = safeName || 'dish';
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  cb(new Error('Only image files are allowed'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// Helper — parse multipart vs JSON body and always return a plain object
function parseBody(req) {
  if (req.is('multipart/form-data')) {
    const { name, description, price, category, image, available, premium } = req.body;
    const body = {
      name: name || '',
      description: description || '',
      price: price !== undefined ? Number(price) : undefined,
      category: category || '',
      image: image || '',
      available: available !== undefined ? available === 'true' : undefined,
      premium: premium !== undefined ? premium === 'true' : undefined,
    };
    // If a file was uploaded, override image with the stored filename
    if (req.file) body.image = req.file.filename;
    return body;
  }
  return req.body;
}

// Helper — enrich menu items with avg ratings
async function enrichWithRatings(menuItems) {
  const reviews = await Review.aggregate([
    { $match: { status: 'Approved' } },
    { $group: { _id: '$menuItem', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const ratingMap = {};
  reviews.forEach((r) => {
    ratingMap[r._id.toString()] = {
      avgRating: Math.round(r.avgRating * 10) / 10,
      reviewCount: r.count,
    };
  });
  return menuItems.map((item) => {
    const obj = item.toObject ? item.toObject() : item;
    const r = ratingMap[obj._id.toString()];
    obj.rating = r ? r.avgRating : 0;
    obj.reviewCount = r ? r.reviewCount : 0;
    return obj;
  });
}

// GET /api/menu — with optional search, category, price, dietary filters
router.get('/', async (req, res) => {
  try {
    const { q, category, minPrice, maxPrice, dietary, available } = req.query;
    const filter = {};

    if (category && category !== 'All') filter.category = category;
    if (available === 'true') filter.available = true;
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (dietary) {
      const tags = Array.isArray(dietary) ? dietary : [dietary];
      filter.dietary = { $all: tags };
    }
    if (q) {
      filter.$text = { $search: q };
    }

    const menuItems = await Menu.find(filter).sort(q ? { score: { $meta: 'textScore' } } : { category: 1, name: 1 });
    const enriched = await enrichWithRatings(menuItems);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

// GET /api/menu/reorder/:userId — suggest items from user's past orders
router.get('/reorder/:userId', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Count frequency of each item ordered
    const freq = {};
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const id = item.itemId.toString();
        freq[id] = (freq[id] || 0) + item.quantity;
      });
    });

    const topIds = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([id]) => id);

    if (topIds.length === 0) return res.json([]);

    const items = await Menu.find({ _id: { $in: topIds }, available: true });
    const enriched = await enrichWithRatings(items);
    // Sort by frequency
    enriched.sort((a, b) => (freq[b._id.toString()] || 0) - (freq[a._id.toString()] || 0));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

// GET /api/menu/categories — distinct categories
router.get('/categories', async (req, res) => {
  try {
    const cats = await Menu.distinct('category');
    res.json(cats);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

router.post('/', [auth, admin, upload.single('image')], async (req, res) => {
  try {
    const body = parseBody(req);
    if (!body.name || !body.description || !body.price || !body.category) {
      return res.status(400).json({ msg: 'Name, description, price, and category are required' });
    }
    const item = await new Menu(body).save();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

router.put('/:id', [auth, admin, upload.single('image')], async (req, res) => {
  try {
    const body = parseBody(req);
    const item = await Menu.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ msg: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    await Menu.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
