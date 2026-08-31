const User = require('../models/User');

const STAFF_ROLES = ['admin', 'owner', 'manager', 'chef', 'kitchen', 'waiter', 'captain', 'staff'];

module.exports = async function (req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ msg: 'Authentication required' });
    }
    
    // Fast path: Check role already loaded on req.user
    const userRole = (req.user.role || '').toLowerCase();
    if (STAFF_ROLES.includes(userRole)) {
      return next();
    }

    // Fallback: Fetch fresh user from DB
    const dbUser = await User.findById(req.user._id || req.user.id);
    if (!dbUser || !STAFF_ROLES.includes((dbUser.role || '').toLowerCase())) {
      return res.status(403).json({ msg: 'Access denied. Administrative / Staff role required.' });
    }

    req.user = dbUser;
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    res.status(500).json({ msg: 'Server authentication error' });
  }
};