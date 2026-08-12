const express = require('express');
const router = express.Router();
const Newsletter = require('../models/Newsletter');

router.post('/', async (req, res) => {
  try {
    const { email, name } = req.body;
    let existing = await Newsletter.findOne({ email });
    if (existing) return res.status(400).json({ msg: 'Already subscribed' });
    const sub = new Newsletter({ email, name });
    await sub.save();
    res.json({ msg: 'Subscribed', sub });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
