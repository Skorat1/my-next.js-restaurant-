const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Menu = require('../models/Menu');
const User = require('../models/User');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const TAX_RATE = 0.08;
const BASE_DELIVERY_FEE = 5;

const PINCODE_ZONES = {
  '100001': { fee: 5, label: 'Zone 1' },
  '100011': { fee: 5, label: 'Zone 1' },
  '110001': { fee: 6, label: 'Zone 2' },
  '400001': { fee: 8, label: 'Zone 3' },
  '700001': { fee: 10, label: 'Zone 4' },
};

function generateOrderNumber() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${ymd}-${rand}`;
}

function computeDeliveryFee(pincode) {
  if (pincode && PINCODE_ZONES[pincode]) return PINCODE_ZONES[pincode].fee;
  return BASE_DELIVERY_FEE;
}

// GET /api/orders/delivery-check?pincode=XXXXXX
router.get('/delivery-check', async (req, res) => {
  const { pincode } = req.query;
  if (!pincode || pincode.length !== 6) return res.json({ available: false, fee: BASE_DELIVERY_FEE, label: '' });
  const zone = PINCODE_ZONES[pincode];
  if (zone) return res.json({ available: true, fee: zone.fee, label: zone.label });
  return res.json({ available: true, fee: BASE_DELIVERY_FEE, label: 'Standard Zone' });
});

// GET /api/orders/slots — available delivery time slots
router.get('/slots', (req, res) => {
  const now = new Date();
  const slots = [];
  for (let h = 10; h <= 21; h++) {
    const t = new Date(now);
    t.setHours(h, 0, 0, 0);
    if (t > now) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hour12 = h > 12 ? h - 12 : h;
      slots.push(`${hour12}:00 ${ampm} – ${hour12 === 12 ? 1 : hour12 + 1}:00 ${h + 1 >= 12 ? 'PM' : 'AM'}`);
    }
  }
  res.json(slots.slice(0, 8));
});

// GET /api/orders & GET /api/orders/all — admin: all orders
const getAllOrdersHandler = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();
    const total = await Order.countDocuments(filter);
    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) {
    console.error('GET /orders admin error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

router.get('/', auth, admin, getAllOrdersHandler);
router.get('/all', auth, admin, getAllOrdersHandler);

// GET /api/orders/:id — get a specific order (owner, matching email, or admin)
router.get('/:id', auth, async (req, res) => {
  try {
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id).lean();
    }
    if (!order) {
      order = await Order.findOne({ orderNumber: req.params.id }).lean();
    }
    if (!order) return res.status(404).json({ msg: 'Order not found.' });

    const isOwner = order.user && order.user.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || req.user.isAdmin;
    const isMatchingEmail = order.customer && order.customer.email && req.user.email && order.customer.email.toLowerCase() === req.user.email.toLowerCase();

    if (!isOwner && !isAdmin && !isMatchingEmail) {
      return res.status(403).json({ msg: 'Access denied. You can only view your own orders.' });
    }
    res.json(order);
  } catch (err) {
    console.error('GET /:id error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// POST /api/orders — place an order (requires login)
router.post('/', auth, async (req, res) => {
  try {
    const {
      items,
      customer,
      paymentMethod,
      couponCode,
      loyaltyPoints,
      deliverySlot,
      notes,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ msg: 'Order must contain at least one item.' });
    }
    if (!customer || !customer.name || !customer.email) {
      return res.status(400).json({ msg: 'Customer name and email are required.' });
    }
    if (!paymentMethod) {
      return res.status(400).json({ msg: 'Payment method is required.' });
    }

    // Validate items & build snapshot
    const detailedItems = [];
    for (const entry of items) {
      let menuItem = null;
      if (entry.itemId && mongoose.Types.ObjectId.isValid(entry.itemId)) {
        menuItem = await Menu.findById(entry.itemId);
      }

      if (menuItem && menuItem.available === false) {
        return res.status(400).json({ msg: `${menuItem.name} is currently unavailable.` });
      }

      const qty = Math.max(1, Math.floor(Number(entry.quantity) || 1));
      const addons = Array.isArray(entry.addons) ? entry.addons : [];
      const options = Array.isArray(entry.options) ? entry.options : [];
      const addonTotal = addons.reduce((s, a) => s + (Number(a.price) || 0), 0);

      const price = menuItem ? menuItem.price : (Number(entry.price) || 0);
      const name = menuItem ? menuItem.name : (entry.name || 'Specialty Item');
      const image = menuItem ? menuItem.image : (entry.image || '');

      const lineTotal = (price + addonTotal) * qty;
      detailedItems.push({
        itemId: entry.itemId || String(menuItem ? menuItem._id : new mongoose.Types.ObjectId()),
        name,
        price,
        quantity: qty,
        image,
        addons,
        options,
        lineTotal,
      });
    }

    // Validate coupon if provided
    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode.toUpperCase() });
      if (!coupon) return res.status(400).json({ msg: 'Invalid coupon code.' });
      if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
        return res.status(400).json({ msg: 'This coupon has expired.' });
      }
    }

    // Compute totals
    const subtotal = detailedItems.reduce((sum, i) => sum + i.lineTotal, 0);
    let discount = 0;
    if (coupon) {
      if (coupon.discountType === 'percent') {
        discount = (subtotal * coupon.value) / 100;
        if (coupon.maxDiscount > 0 && discount > coupon.maxDiscount) discount = coupon.maxDiscount;
      } else {
        discount = Math.min(coupon.value, subtotal);
      }
    }

    // Loyalty points discount
    const POINTS_PER_PAISE = 0.01;
    const pointsUsed = Math.min(Number(loyaltyPoints) || 0, req.user.loyaltyPoints || 0);
    const loyaltyDiscount = Math.round(pointsUsed * POINTS_PER_PAISE * 100) / 100;

    const deliveryFee = computeDeliveryFee(customer.pincode);
    const taxable = Math.max(0, subtotal - discount - loyaltyDiscount);
    const tax = Math.round(taxable * TAX_RATE * 100) / 100;
    const total = Math.round((taxable + tax + deliveryFee) * 100) / 100;

    const order = new Order({
      orderNumber: generateOrderNumber(),
      user: req.user._id,
      items: detailedItems,
      customer,
      paymentMethod,
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      tax,
      deliveryFee,
      total,
      coupon: coupon ? coupon._id : undefined,
      loyaltyPointsUsed: pointsUsed,
      deliverySlot: deliverySlot || '',
      notes: notes || '',
      status: 'Pending',
    });

    await order.save();

    // Deduct loyalty points if used
    if (pointsUsed > 0) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { loyaltyPoints: -pointsUsed } });
    }

    // Award loyalty points (1 point per $1 spent)
    const earnedPoints = Math.floor(total);
    await User.findByIdAndUpdate(req.user._id, { $inc: { loyaltyPoints: earnedPoints } });

    res.status(201).json({ order, msg: 'Order placed successfully.' });
  } catch (err) {
    console.error('POST /orders error:', err);
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});



// PATCH & PUT /api/orders/:id/status — admin: update order status
const updateStatusHandler = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ msg: 'Invalid status value.' });

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ msg: 'Order not found.' });
    res.json({ order, msg: 'Order status updated successfully.' });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

router.patch('/:id/status', auth, admin, updateStatusHandler);
router.put('/:id/status', auth, admin, updateStatusHandler);

// DELETE /api/orders/:id — admin: delete order
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Order not found.' });
    res.json({ msg: 'Order deleted successfully.' });
  } catch (err) {
    console.error('DELETE order error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
