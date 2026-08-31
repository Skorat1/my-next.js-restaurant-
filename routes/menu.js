const express = require('express');
const router = express.Router();
const multer = require('multer');
const Menu = require('../models/Menu');
const Review = require('../models/Review');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const cache = require('../middleware/cache');

// ── Multer Memory Storage — safe for Serverless / Vercel (no read-only disk write errors)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

// Helper — parse multipart vs JSON body safely
function parseBody(req) {
  const isMultipart = req.is('multipart/form-data');
  const src = req.body || {};

  const body = {};

  if (src.name !== undefined) body.name = String(src.name).trim();
  if (src.description !== undefined) body.description = String(src.description).trim();
  if (src.price !== undefined) body.price = Number(src.price);
  if (src.category !== undefined) body.category = String(src.category).trim();

  if (src.available !== undefined) body.available = src.available === true || src.available === 'true';
  if (src.premium !== undefined) body.premium = src.premium === true || src.premium === 'true';
  if (src.vegetarian !== undefined) body.vegetarian = src.vegetarian === true || src.vegetarian === 'true';
  if (src.spicy !== undefined) body.spicy = src.spicy === true || src.spicy === 'true';
  if (src.popular !== undefined) body.popular = src.popular === true || src.popular === 'true';
  if (src.isSpecial !== undefined) body.isSpecial = src.isSpecial === true || src.isSpecial === 'true';

  if (src.station !== undefined) body.station = src.station;
  if (src.estimatedPrepTime !== undefined) body.estimatedPrepTime = Number(src.estimatedPrepTime) || 15;

  if (src.addons !== undefined) {
    if (typeof src.addons === 'string') {
      try {
        body.addons = JSON.parse(src.addons);
      } catch {
        body.addons = [];
      }
    } else if (Array.isArray(src.addons)) {
      body.addons = src.addons;
    }
  }

  if (src.dietary !== undefined) {
    if (typeof src.dietary === 'string') {
      try {
        body.dietary = JSON.parse(src.dietary);
      } catch {
        body.dietary = src.dietary.split(',').map(s => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(src.dietary)) {
      body.dietary = src.dietary;
    }
  }

  // Handle  upload from buffer or string URL
  if (req.file) {
    const mime = req.file.mimetype || 'image/jpeg';
    const base64 = req.file.buffer.toString('base64');
    body.image = `data:${mime};base64,${base64}`;
  } else if (src.image && typeof src.image === 'string' && src.image.trim()) {
    body.image = src.image.trim();
  }

  return body;
}

// Helper — enrich menu items with avg ratings
async function enrichWithRatings(menuItems) {
  try {
    const reviews = await Review.aggregate([
      { $match: { status: 'Approved' } },
      { $group: { _id: '$menuItem', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const ratingMap = {};
    reviews.forEach((r) => {
      if (r._id) {
        ratingMap[r._id.toString()] = {
          avgRating: Math.round(r.avgRating * 10) / 10,
          reviewCount: r.count,
        };
      }
    });
    return menuItems.map((item) => {
      const obj = item.toObject ? item.toObject() : item;
      const r = obj._id ? ratingMap[obj._id.toString()] : null;
      obj.rating = r ? r.avgRating : 0;
      obj.reviewCount = r ? r.reviewCount : 0;
      return obj;
    });
  } catch (enrichErr) {
    return menuItems;
  }
}

// GET /api/menu — with optional search, category, price, dietary filters
router.get('/', cache(300), async (req, res) => {
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
    console.error('GET /api/menu error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// GET /api/menu/categories — distinct categories
router.get('/categories', cache(300), async (req, res) => {
  try {
    const cats = await Menu.distinct('category');
    res.json(cats);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

// POST /api/menu — Add new menu item
router.post('/', [auth, admin, upload.single('image')], async (req, res) => {
  try {
    const body = parseBody(req);
    if (!body.name || !body.description || body.price === undefined || !body.category) {
      return res.status(400).json({ msg: 'Name, description, price, and category are required.' });
    }
    if (!body.image) {
      body.image = 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80';
    }
    const item = new Menu(body);
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    console.error('POST /api/menu error:', err);
    res.status(400).json({ msg: err.message || 'Failed to save menu item.' });
  }
});

// PUT /api/menu/:id — Update existing menu item
router.put('/:id', [auth, admin, upload.single('image')], async (req, res) => {
  try {
    const body = parseBody(req);
    const existing = await Menu.findById(req.params.id);
    if (!existing) return res.status(404).json({ msg: 'Menu item not found.' });

    // If no new image was provided, keep the existing image
    if (!body.image) {
      body.image = existing.image;
    }

    const updated = await Menu.findByIdAndUpdate(
      req.params.id,
      { $set: body },
      { new: true, runValidators: true }
    );
    res.json(updated);
  } catch (err) {
    console.error('PUT /api/menu/:id error:', err);
    res.status(400).json({ msg: err.message || 'Failed to update menu item.' });
  }
});

// DELETE /api/menu/:id — Remove menu item
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    const item = await Menu.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ msg: 'Menu item not found.' });
    res.json({ success: true, msg: 'Menu item deleted successfully.' });
  } catch (err) {
    console.error('DELETE /api/menu/:id error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// PUT /api/menu/:id/availability — Quick 1-click availability toggle
router.put('/:id/availability', [auth, admin], async (req, res) => {
  try {
    const item = await Menu.findById(req.params.id);
    if (!item) return res.status(404).json({ msg: 'Item not found' });
    item.available = req.body.available !== undefined ? req.body.available : !item.available;
    await item.save();
    res.json({ success: true, available: item.available, item });
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
