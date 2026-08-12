const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    discountType: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true },
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // 0 = no cap
    startsAt: { type: Date },
    expiresAt: { type: Date },
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', CouponSchema);

