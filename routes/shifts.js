const express = require('express');
const router = express.Router();
const Shift = require('../models/Shift');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// POST /api/shifts/clock-in
router.post('/clock-in', auth, async (req, res) => {
  try {
    // Check if there is already an active shift
    const activeShift = await Shift.findOne({ user: req.user._id, status: 'Active' });
    if (activeShift) {
      return res.status(400).json({ msg: 'You already have an active shift.', shift: activeShift });
    }

    const newShift = new Shift({
      user: req.user._id,
      clockInTime: new Date()
    });
    await newShift.save();
    res.status(201).json({ msg: 'Clocked in successfully', shift: newShift });
  } catch (err) {
    console.error('Clock-in error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// POST /api/shifts/clock-out
router.post('/clock-out', auth, async (req, res) => {
  try {
    const activeShift = await Shift.findOne({ user: req.user._id, status: 'Active' });
    if (!activeShift) {
      return res.status(400).json({ msg: 'No active shift found to clock out of.' });
    }

    activeShift.clockOutTime = new Date();
    activeShift.status = 'Completed';
    await activeShift.save();
    res.json({ msg: 'Clocked out successfully', shift: activeShift });
  } catch (err) {
    console.error('Clock-out error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// GET /api/shifts/me (My shift history & active status)
router.get('/me', auth, async (req, res) => {
  try {
    const shifts = await Shift.find({ user: req.user._id }).sort({ clockInTime: -1 }).limit(30);
    const activeShift = shifts.find(s => s.status === 'Active') || null;
    res.json({ shifts, activeShift });
  } catch (err) {
    console.error('GET my shifts error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// GET /api/shifts (Admin: View all shifts)
router.get('/', auth, admin, async (req, res) => {
  try {
    const { status, date } = req.query;
    let filter = {};
    if (status) filter.status = status;
    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(d.getDate() + 1);
      filter.clockInTime = { $gte: d, $lt: nextDay };
    }

    const shifts = await Shift.find(filter)
      .populate('user', 'name email role')
      .sort({ clockInTime: -1 })
      .lean();
    res.json(shifts);
  } catch (err) {
    console.error('GET all shifts error:', err);
    res.status(500).json({ msg: 'Server Error' });
  }
});

module.exports = router;
