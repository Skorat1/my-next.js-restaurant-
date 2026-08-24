const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Menu = require('../models/Menu');
const Recipe = require('../models/Recipe');
const Ingredient = require('../models/Ingredient');
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

// GET /api/orders/kds — admin: get active orders for Kitchen Display System
router.get('/kds/active', auth, admin, async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $in: ['Pending', 'Confirmed', 'Preparing', 'Ready'] },
    })
      .populate('user', 'name email')
      .sort({ createdAt: 1 }) // oldest first for kitchen
      .lean();
    res.json(orders);
  } catch (err) {
    console.error('GET /orders/kds/active admin error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

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
      payments, // optional array for split bills
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
        station: menuItem && menuItem.station ? menuItem.station : 'Main Kitchen',
        estimatedPrepTime: menuItem && menuItem.estimatedPrepTime ? menuItem.estimatedPrepTime : 15,
        itemStatus: 'Pending',
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
      payments: payments || [],
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

    // Deduct inventory
    try {
      for (const item of detailedItems) {
        if (item.itemId && mongoose.Types.ObjectId.isValid(item.itemId)) {
          const recipe = await Recipe.findOne({ menuItem: item.itemId });
          if (recipe && recipe.ingredients) {
            for (const recIng of recipe.ingredients) {
              await Ingredient.findByIdAndUpdate(recIng.ingredient, {
                $inc: { currentStock: -(recIng.quantity * item.quantity) }
              });
            }
          }
        }
      }
    } catch (invErr) {
      console.error('Inventory deduction error:', invErr);
    }

    // Deduct loyalty points if used
    if (pointsUsed > 0) {
      await User.findByIdAndUpdate(req.user._id, { $inc: { loyaltyPoints: -pointsUsed } });
    }

    // Award loyalty points (1 point per $1 spent)
    const earnedPoints = Math.floor(total);
    await User.findByIdAndUpdate(req.user._id, { $inc: { loyaltyPoints: earnedPoints } });

    const io = req.app.get('io');
    if (io) {
      io.emit('new_order', order);
    }

    try {
      const { sendEmail } = require('../config/email');
      const itemsListHtml = detailedItems.map(i => `<li>${i.quantity}x ${i.name} - ₹${i.lineTotal}</li>`).join('');
      await sendEmail({
        to: customer.email,
        subject: `Order Confirmed - ${order.orderNumber}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eee;">
            <div style="background:#0a0a0a;padding:28px;text-align:center;">
              <h1 style="color:#f59e0b;font-family:Georgia,serif;margin:0;letter-spacing:2px;">VELORA</h1>
              <p style="color:#aaa;margin:6px 0 0;font-size:12px;text-transform:uppercase;letter-spacing:3px;">Order Confirmation</p>
            </div>
            <div style="padding:32px;">
              <h2 style="color:#111;margin:0 0 12px;">Hello ${customer.name},</h2>
              <p style="color:#444;line-height:1.6;margin:0 0 16px;">
                Thank you for your order! Your order <strong>${order.orderNumber}</strong> has been successfully placed.
              </p>
              <h3 style="color:#111;margin:20px 0 10px;">Order Summary</h3>
              <ul style="color:#444;padding-left:20px;margin-bottom:16px;">
                ${itemsListHtml}
              </ul>
              <p style="color:#444;line-height:1.6;margin:0 0 16px;">
                <strong>Payment Method:</strong> ${paymentMethod}<br/>
                <strong>Total Amount:</strong> ₹${total.toFixed(2)}
              </p>
            </div>
          </div>
        `,
        text: `Hello ${customer.name},\n\nThank you for your order! Your order ${order.orderNumber} has been successfully placed for a total of ₹${total.toFixed(2)}.\n\n— VELORA`
      });
    } catch (emailErr) {
      console.error('Error sending order email:', emailErr);
    }

    res.status(201).json({ order, msg: 'Order placed successfully.' });
  } catch (err) {
    console.error('POST /orders error:', err);
    res.status(500).json({ msg: err.message || 'Server Error' });
  }
});



// PATCH & PUT /api/orders/:id/status — admin: update order status
const updateStatusHandler = async (req, res) => {
  try {
    const { status, estimatedPrepTime, cancellationReason } = req.body;
    const valid = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ msg: 'Invalid status value.' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Order not found.' });

    order.status = status;
    if (estimatedPrepTime !== undefined) {
      order.estimatedPrepTime = Number(estimatedPrepTime);
    }
    if (cancellationReason !== undefined) {
      order.cancellationReason = String(cancellationReason);
    }
    
    if (status === 'Confirmed' || status === 'Preparing') {
      if (!order.prepStartTime) order.prepStartTime = new Date();
    }
    if (['Ready', 'Out for Delivery', 'Delivered'].includes(status) && !order.prepEndTime) {
      order.prepEndTime = new Date();
    }
    await order.save();

    // Send WhatsApp Feedback Request
    if (status === 'Delivered' && order.customer?.phone) {
      try {
        const { sendFeedbackRequest } = require('../services/whatsapp');
        await sendFeedbackRequest(order.customer.phone, order.customer.name, order._id);
      } catch (e) {
        console.error('WhatsApp feedback request failed:', e);
      }
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order._id}`).emit('order_status_updated', order);
      if (order.orderNumber) {
        io.to(`order_${order.orderNumber}`).emit('order_status_updated', order);
      }
      io.emit('order_updated', order);
    }

    res.json({ order, msg: 'Order status updated successfully.' });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
};

router.patch('/:id/status', auth, admin, updateStatusHandler);
router.put('/:id/status', auth, admin, updateStatusHandler);

// PATCH /api/orders/:id/items/:itemId/status — KDS: update individual item status
router.patch('/:id/items/:itemId/status', auth, admin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Pending', 'Preparing', 'Ready'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid item status.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ msg: 'Order not found.' });

    let item;
    if (mongoose.Types.ObjectId.isValid(req.params.itemId)) {
      item = order.items.id(req.params.itemId);
    }
    if (!item) {
      item = order.items.find(i => String(i.itemId) === req.params.itemId || String(i._id) === req.params.itemId);
    }
    
    if (!item) return res.status(404).json({ msg: 'Item not found in order.' });

    item.itemStatus = status;
    if (status === 'Preparing' && !item.prepStartTime) {
      item.prepStartTime = new Date();
    }
    await order.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order._id}`).emit('order_item_updated', { orderId: order._id, itemId: item._id, status });
      io.emit('kds_item_updated', { orderId: order._id, item });
    }

    res.json({ order, msg: 'Item status updated.' });
  } catch (err) {
    console.error('Update item status error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

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
