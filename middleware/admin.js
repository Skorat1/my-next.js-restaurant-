const User = require('../models/User');

module.exports = async function (req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (user.role !== 'admin') {
      return res.status(403).json({ msg: 'Access denied. Not an admin.' });
    }
    next();
  } catch (err) {
    res.status(500).send('Server error');
  }
};