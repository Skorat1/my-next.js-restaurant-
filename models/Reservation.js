const mongoose = require('mongoose');
const crypto = require('crypto');

const ReservationSchema = new mongoose.Schema({
  passCode: { type: String, unique: true, sparse: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  date: { type: Date, required: true },
  guests: { type: Number, default: 2 },
  notes: { type: String },
  occasion: { type: String, default: 'General' },
  tableId: { type: String, default: 'T1' },
  dietary: [{ type: String }],
  preOrders: [{
    id: String,
    name: String,
    price: Number,
    category: String,
    icon: String,
  }],
  promoCode: { type: String },
  discountAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  specialRequests: { type: String },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Declined', 'Seated', 'Completed', 'Waitlisted'], default: 'Pending' },
  tableNo: { type: String },
  area: { type: String, default: 'Main Room' },
  verified: { type: Boolean, default: false },
  verificationToken: { type: String },
}, { timestamps: true });

ReservationSchema.pre('save', function (next) {
  if (!this.passCode) {
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    this.passCode = `RES-${randomHex}`;
  }
  next();
});

ReservationSchema.index({ email: 1 });
ReservationSchema.index({ status: 1 });
ReservationSchema.index({ createdAt: -1 });
ReservationSchema.index({ verificationToken: 1 }, { sparse: true });

module.exports = mongoose.model('Reservation', ReservationSchema);


