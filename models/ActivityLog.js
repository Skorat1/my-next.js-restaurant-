const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, default: 'customer' },
  action: { type: String, enum: ['login', 'logout', 'signup'], required: true },
  ip: { type: String },
  userAgent: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
