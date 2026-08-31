const express = require('express');
const router = express.Router();
const Review = require('../models/Review');
const Menu = require('../models/Menu');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Submit a review (requires login)
router.post('/', auth, async (req, res) => {
  try {
    const { menuItem, rating, comment, serviceRating } = req.body;

    if (!menuItem) return res.status(400).json({ msg: 'Menu item is required.' });
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ msg: 'Rating must be between 1 and 5.' });
    }
    if (!comment || !comment.trim()) {
      return res.status(400).json({ msg: 'Review comment is required.' });
    }

    const menu = await Menu.findById(menuItem);
    if (!menu) return res.status(404).json({ msg: 'Menu item not found.' });

    const review = new Review({
      user: req.user._id,
      userName: req.user.name,
      menuItem: menu._id,
      menuItemName: menu.name,
      rating: Number(rating),
      comment: comment.trim(),
      serviceRating: serviceRating ? Number(serviceRating) : undefined,
      status: 'Pending',
    });
    await review.save();
    res.status(201).json({ msg: 'Review submitted and awaiting moderation.', review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get all approved reviews (Public)
router.get('/', async (req, res) => {
  try {
    const reviews = await Review.find({ status: 'Approved' }).sort({ createdAt: -1 }).limit(50);
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get approved reviews for a menu item (Public)
router.get('/item/:menuItemId', async (req, res) => {
  try {
    const reviews = await Review.find({
      menuItem: req.params.menuItemId,
      status: 'Approved',
    }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Get all reviews (Admin)
router.get('/all', [auth, admin], async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Moderate review: approve/reject (Admin)
router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const { status, adminReply } = req.body;
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ msg: 'Review not found' });

    if (status && ['Pending', 'Approved', 'Rejected'].includes(status)) {
      review.status = status;
    }
    if (adminReply !== undefined) review.adminReply = adminReply;
    await review.save();
    res.json({ success: true, review });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Delete review (Admin)
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;

