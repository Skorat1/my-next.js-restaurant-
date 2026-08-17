const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const cache = require('../middleware/cache');

// Ensure all analytics routes are admin only
router.use(auth, admin);

// GET /api/analytics/business
router.get('/business', cache(300), async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Revenue over time (last 30 days)
    const revenueOverTime = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: { $nin: ['Cancelled'] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 2. Top selling items (all time or last 30 days, doing last 30 for relevance)
    const topItems = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: { $nin: ['Cancelled'] },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.name',
          quantitySold: { $sum: '$items.quantity' },
          revenueGenerated: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 },
    ]);

    // 3. Peak Hours (hour of day)
    const peakHours = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      revenueOverTime,
      topItems,
      peakHours,
    });
  } catch (err) {
    console.error('GET /analytics/business error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
