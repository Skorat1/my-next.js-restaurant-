const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function (req, res, next) {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const jwtSecret = process.env.JWT_SECRET || 'velora_fine_dining_ultra_secret_key_2026';
    const decoded = jwt.verify(token, jwtSecret);
    const userId = decoded.id || decoded._id || decoded.userId;
    
    if (!userId) {
      return res.status(401).json({ msg: 'Token payload invalid' });
    }

    req.user = await User.findById(userId).select('-password');
    if (!req.user) {
      return res.status(401).json({ msg: 'User session expired or not found' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid or expired' });
  }
};
