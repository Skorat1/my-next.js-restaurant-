const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// Get active coupons (Public)
router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      active: true,
      $and: [
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gte: now } }] },
        { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
      ],
    }).sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Validate a coupon code (Public)
router.post('/validate', async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) return res.status(400).json({ msg: 'Coupon code is required.' });

    const coupon = await Coupon.findOne({ code: code.toUpperCase() });
    if (!coupon) return res.status(400).json({ msg: 'Invalid coupon code.' });
    if (!coupon.active) return res.status(400).json({ msg: 'This coupon is no longer active.' });
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ msg: 'This coupon has expired.' });
    }
    if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) {
      return res.status(400).json({ msg: 'This coupon is not active yet.' });
    }
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ msg: 'This coupon has reached its usage limit.' });
    }
    if (coupon.minOrder > 0 && Number(subtotal || 0) < coupon.minOrder) {
      return res.status(400).json({
        msg: `Minimum order of $${coupon.minOrder.toFixed(2)} required for this coupon.`,
      });
    }

    res.json({ valid: true, coupon });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Admin: create coupon
router.post('/', [auth, admin], async (req, res) => {
  try {
    const { code, description, discountType, value, minOrder, maxDiscount, startsAt, expiresAt, usageLimit, active } = req.body;

    if (!code || !code.trim()) return res.status(400).json({ msg: 'Coupon code is required.' });
    if (!discountType || !['percent', 'flat'].includes(discountType)) {
      return res.status(400).json({ msg: 'Discount type must be percent or flat.' });
    }
    if (!value || value <= 0) return res.status(400).json({ msg: 'Discount value must be positive.' });

    const existing = await Coupon.findOne({ code: code.toUpperCase().trim() });
    if (existing) return res.status(400).json({ msg: 'Coupon code already exists.' });

    const coupon = new Coupon({
      code: code.toUpperCase().trim(),
      description: description || '',
      discountType,
      value: Number(value),
      minOrder: Number(minOrder) || 0,
      maxDiscount: Number(maxDiscount) || 0,
      startsAt: startsAt || undefined,
      expiresAt: expiresAt || undefined,
      usageLimit: Number(usageLimit) || 0,
      active: active !== undefined ? active : true,
    });
    await coupon.save();
    res.status(201).json({ msg: 'Coupon created!', coupon });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Admin: list all coupons
router.get('/all', [auth, admin], async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Admin: update coupon
router.put('/:id', [auth, admin], async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ msg: 'Coupon not found' });

    const { description, discountType, value, minOrder, maxDiscount, startsAt, expiresAt, usageLimit, active } = req.body;

    if (description !== undefined) coupon.description = description;
    if (discountType && ['percent', 'flat'].includes(discountType)) coupon.discountType = discountType;
    if (value) coupon.value = Number(value);
    if (minOrder !== undefined) coupon.minOrder = Number(minOrder);
    if (maxDiscount !== undefined) coupon.maxDiscount = Number(maxDiscount);
    if (startsAt !== undefined) coupon.startsAt = startsAt || undefined;
    if (expiresAt !== undefined) coupon.expiresAt = expiresAt || undefined;
    if (usageLimit !== undefined) coupon.usageLimit = Number(usageLimit);
    if (active !== undefined) coupon.active = active;

    await coupon.save();
    res.json({ success: true, coupon });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// Admin: delete coupon
router.delete('/:id', [auth, admin], async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;

