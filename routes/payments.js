const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Order = require('../models/Order');
const auth = require('../middleware/auth');

// Razorpay is loaded lazily so the server still boots without the SDK installed
// or without keys configured (dev/fallback mode uses simulated payment).
let Razorpay = null;
try {
  Razorpay = require('razorpay');
} catch {
  Razorpay = null;
}

const isRazorpayConfigured = () =>
  Razorpay &&
  process.env.RAZORPAY_KEY_ID &&
  process.env.RAZORPAY_KEY_SECRET;

// Backend-driven payment intent: create a Razorpay order for an existing order.
// POST /api/payments/create — body: { orderId }
router.post('/create', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ msg: 'Order ID is required.' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ msg: 'Order not found.' });
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ msg: 'Access denied.' });
    }

    // If already paid, short-circuit
    if (order.paymentStatus === 'Paid') {
      return res.json({
        paid: true,
        orderId: order._id,
        msg: 'Order is already paid.',
      });
    }

    // Fallback: no Razorpay keys configured → simulated mode
    if (!isRazorpayConfigured()) {
      order.paymentStatus = 'Paid';
      order.paymentMethod = order.paymentMethod || 'Card';
      order.razorpayReference = `sim-${Date.now()}`;
      await order.save();
      return res.json({
        paid: true,
        simulated: true,
        orderId: order._id,
        msg: 'Payment simulated (no gateway configured).',
      });
    }

    // Real Razorpay order creation (amount in paise)
    const rzp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const rzpOrder = await rzp.orders.create({
      amount: Math.round(order.total * 100),
      currency: 'INR',
      receipt: `order_${order._id}`,
      notes: { orderNumber: order.orderNumber },
    });

    order.razorpayOrderId = rzpOrder.id;
    await order.save();

    res.json({
      paid: false,
      key: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      orderId: order._id,
      customer: order.customer,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error creating payment.' });
  }
});

// Verify Razorpay payment signature after checkout.
// POST /api/payments/verify — body: { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature }
router.post('/verify', auth, async (req, res) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    if (!orderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ msg: 'Missing payment verification data.' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ msg: 'Order not found.' });
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ msg: 'Access denied.' });
    }

    // Generate expected signature: hmac_sha256(order_id|payment_id, key_secret)
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature) {
      order.paymentStatus = 'Failed';
      await order.save();
      return res.status(400).json({ msg: 'Payment verification failed. Signature mismatch.' });
    }

    // Mark as paid
    order.paymentStatus = 'Paid';
    order.razorpayPaymentId = razorpay_payment_id;
    order.razorpayOrderId = razorpay_order_id;
    order.razorpaySignature = razorpay_signature;
    await order.save();

    res.json({ success: true, msg: 'Payment verified successfully.', orderId: order._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error verifying payment.' });
  }
});

module.exports = router;
