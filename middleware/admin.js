const User = require('../models/User');

module.exports = async function (req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    // admin login error //
    if (user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Not an admin.' });
    }
    next();
    // server error admin panel not any changes//
  } catch (err) {
    res.status(500).send('Server error');
  }
};