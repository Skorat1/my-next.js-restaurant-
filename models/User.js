const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer' }, // customer, admin, manager, waiter, delivery
  permissions: { type: [String], default: [] }, // granular permissions
  isVerified: { type: Boolean, default: false },
  isApproved: { type: Boolean, default: false },
  verificationToken: { type: String },
  resetToken: { type: String },
  resetTokenExpiry: { type: Date },
  loyaltyPoints: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  membership: {
    tier: { type: String, enum: ['gold', 'platinum'], default: null },
    active: { type: Boolean, default: false },
    startedAt: { type: Date },
    expiresAt: { type: Date },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
  },
}, { timestamps: true });

UserSchema.index({ role: 1 });
UserSchema.index({ isVerified: 1 });
UserSchema.index({ isApproved: 1 });
UserSchema.index({ verificationToken: 1 }, { sparse: true });
UserSchema.index({ resetToken: 1 }, { sparse: true });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ name: 'text', email: 'text' });

module.exports = mongoose.model('User', UserSchema);
