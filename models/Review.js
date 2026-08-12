const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, required: true },
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu', required: true },
    menuItemName: { type: String },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    serviceRating: { type: Number, min: 1, max: 5 },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    adminReply: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', ReviewSchema);

