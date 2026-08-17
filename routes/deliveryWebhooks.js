const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const crypto = require('crypto');

// Generate unique order ID for external platforms
const generateOrderNumber = (prefix) => {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

// Webhook for Zomato Orders
router.post('/zomato', async (req, res) => {
  try {
    const { customer_name, customer_phone, items, total_amount, zomato_order_id } = req.body;
    
    // In production, we'd verify Zomato webhook signatures here.

    const order = new Order({
      orderNumber: generateOrderNumber('ZMT'),
      user: null, // Guest/External
      customer: {
        name: customer_name || 'Zomato Customer',
        phone: customer_phone || '0000000000',
        address: 'Zomato Delivery',
      },
      items: items.map(i => ({
        itemId: i.id || 'ext_item',
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      })),
      subtotal: total_amount,
      discount: 0,
      tax: 0,
      deliveryFee: 0,
      total: total_amount,
      paymentMethod: 'Aggregator (Zomato)',
      status: 'Pending',
      notes: `Zomato Order ID: ${zomato_order_id}`
    });

    await order.save();

    // Broadcast new order to POS/KDS
    const io = req.app.get('io');
    if (io) {
      io.emit('new_order', order);
    }

    res.status(200).json({ success: true, message: 'Zomato order injected successfully', internal_id: order._id });
  } catch (err) {
    console.error('Zomato webhook error:', err);
    res.status(500).json({ success: false, message: 'Failed to process webhook' });
  }
});

// Webhook for Swiggy Orders
router.post('/swiggy', async (req, res) => {
  try {
    const { swiggy_order_id, user, cart, final_total } = req.body;
    
    // In production, we'd verify Swiggy webhook signatures here.

    const order = new Order({
      orderNumber: generateOrderNumber('SWG'),
      user: null, // Guest/External
      customer: {
        name: user?.name || 'Swiggy Customer',
        phone: user?.phone || '0000000000',
        address: 'Swiggy Delivery',
      },
      items: cart.map(i => ({
        itemId: i.id || 'ext_item',
        name: i.name,
        quantity: i.quantity,
        price: i.price,
      })),
      subtotal: final_total,
      discount: 0,
      tax: 0,
      deliveryFee: 0,
      total: final_total,
      paymentMethod: 'Aggregator (Swiggy)',
      status: 'Pending',
      notes: `Swiggy Order ID: ${swiggy_order_id}`
    });

    await order.save();

    // Broadcast new order to POS/KDS
    const io = req.app.get('io');
    if (io) {
      io.emit('new_order', order);
    }

    res.status(200).json({ success: true, message: 'Swiggy order injected successfully', internal_id: order._id });
  } catch (err) {
    console.error('Swiggy webhook error:', err);
    res.status(500).json({ success: false, message: 'Failed to process webhook' });
  }
});

module.exports = router;
