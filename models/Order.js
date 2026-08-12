const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  itemId:   { type: mongoose.Schema.Types.Mixed, required: true },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  image:    { type: String, default: '' },
  addons:   [{ name: String, price: Number }],
  options:  [{ group: String, value: String }],
  lineTotal:{ type: Number, default: 0 },
});

const CustomerSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  email:   { type: String, required: true },
  phone:   { type: String, default: '' },
  address: { type: String, default: '' },
  pincode: { type: String, default: '' },
}, { _id: false });

const OrderSchema = new mongoose.Schema(
  {
    orderNumber:       { type: String, default: '' },
    user:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items:             [OrderItemSchema],
    customer:          { type: CustomerSchema, required: true },
    paymentMethod:     { type: String, required: true },
    status:            {
      type: String,
      enum: ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Out for Delivery', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
    subtotal:          { type: Number, default: 0 },
    discount:          { type: Number, default: 0 },
    tax:               { type: Number, default: 0 },
    deliveryFee:       { type: Number, default: 5 },
    total:             { type: Number, default: 0 },
    coupon:            { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },
    loyaltyPointsUsed: { type: Number, default: 0 },
    deliverySlot:      { type: String, default: '' },
    notes:             { type: String, default: '' },
    // Payment gateway fields
    razorpayOrderId:   { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    paid:              { type: Boolean, default: false },
    paidAt:            { type: Date },
  },
  { timestamps: true }
);

OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ orderNumber: 1 }, { sparse: true });
OrderSchema.index({ paid: 1 });

module.exports = mongoose.model('Order', OrderSchema);
