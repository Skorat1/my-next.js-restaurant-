const User = require('../models/User');

module.exports = async function (req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    const staffRoles = ['admin', 'owner', 'manager', 'chef', 'kitchen', 'waiter', 'delivery'];
    if (!user || !staffRoles.includes(user.role)) {
      return res.status(403).json({ msg: 'Access denied. Authorized staff only.' });
    }
    req.staffUser = user;
    next();
  } catch (err) {
    res.status(500).send('Server error');
  }
};