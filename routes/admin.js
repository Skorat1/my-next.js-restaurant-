const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const Menu = require('../models/Menu');
const Contact = require('../models/Contact');
const Newsletter = require('../models/Newsletter');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const ActivityLog = require('../models/ActivityLog');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const bcrypt = require('bcryptjs');

// All admin routes are protected
router.use(auth, admin);

// GET /api/admin/stats — Dashboard summary
router.get('/stats', async (req, res) => {
  try {
    const [
      totalReservations,
      pendingReservations,
      confirmedReservations,
      declinedReservations,
      verifiedReservations,
      totalUsers,
      totalMenuItems,
      totalInquiries,
      totalSubscribers,
      totalOrders,
      pendingOrders,
      totalReviews,
      pendingReviews,
      totalCoupons,
      activeCoupons,
      recentReservations,
      recentOrders,
    ] = await Promise.all([
      Reservation.countDocuments(),
      Reservation.countDocuments({ status: 'Pending' }),
      Reservation.countDocuments({ status: 'Confirmed' }),
      Reservation.countDocuments({ status: 'Declined' }),
      Reservation.countDocuments({ verified: true }),
      User.countDocuments(),
      Menu.countDocuments(),
      Contact.countDocuments(),
      Newsletter.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({ status: { $in: ['Pending', 'Confirmed', 'Preparing'] } }),
      Review.countDocuments(),
      Review.countDocuments({ status: 'Pending' }),
      Coupon.countDocuments(),
      Coupon.countDocuments({ active: true }),
      Reservation.find().sort({ createdAt: -1 }).limit(8),
      Order.find().sort({ createdAt: -1 }).limit(8),
    ]);

    res.json({
      counts: {
        totalReservations,
        pendingReservations,
        confirmedReservations,
        declinedReservations,
        verifiedReservations,
        totalUsers,
        totalMenuItems,
        totalInquiries,
        totalSubscribers,
        totalOrders,
        pendingOrders,
        totalReviews,
        pendingReviews,
        totalCoupons,
        activeCoupons,
      },
      recentReservations,
      recentOrders,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/admin/users — List all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/admin/users — Create a new user (admin)
router.post('/users', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ msg: 'Name, email, and password are required.' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'A user with this email already exists.' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: role === 'admin' ? 'admin' : 'customer',
      isVerified: true,
    });
    await user.save();

    res.status(201).json({
      success: true,
      msg: 'User created successfully.',
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/admin/users/:id — Update a user (admin)
router.put('/users/:id', async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Prevent removing your own admin role
    if (role && role !== 'admin' && user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ msg: 'You cannot remove your own admin role' });
    }

    if (name !== undefined) user.name = name;
    if (email !== undefined) {
      if (user.email !== email) {
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ msg: 'A user with this email already exists.' });
      }
      user.email = email;
    }
    if (role && ['customer', 'admin'].includes(role)) user.role = role;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();
    res.json({
      success: true,
      msg: 'User updated successfully.',
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isVerified: user.isVerified, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/admin/users/:id — Delete a user (admin)
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Prevent deleting yourself
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ msg: 'You cannot delete your own account' });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, msg: 'User deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

// PUT /api/admin/users/:id/role — Promote / demote admin
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['customer', 'admin'].includes(role)) {
      return res.status(400).json({ msg: 'Invalid role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    // Prevent removing your own admin role
    if (user._id.toString() === req.user._id.toString() && role !== 'admin') {
      return res.status(400).json({ msg: 'You cannot remove your own admin role' });
    }

    user.role = role;
    await user.save();
    res.json({ success: true, msg: `Role updated to ${role}`, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/admin/newsletter — List subscribers
router.get('/newsletter', async (req, res) => {
  try {
    const subs = await Newsletter.find().sort({ subscribedAt: -1 });
    res.json(subs);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// DELETE /api/admin/newsletter/:id — Remove subscriber
router.delete('/newsletter/:id', async (req, res) => {
  try {
    await Newsletter.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/admin/activity — User activity logs
router.get('/activity', async (req, res) => {
  try {
    const logs = await ActivityLog.find().sort({ createdAt: -1 }).limit(200);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;

