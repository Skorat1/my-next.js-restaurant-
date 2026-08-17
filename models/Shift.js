const mongoose = require('mongoose');

const ShiftSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  clockInTime: {
    type: Date,
    required: true,
    default: Date.now,
  },
  clockOutTime: {
    type: Date,
    default: null,
  },
  status: {
    type: String,
    enum: ['Active', 'Completed'],
    default: 'Active',
  },
  notes: {
    type: String,
    default: '',
  }
}, { timestamps: true });

ShiftSchema.index({ user: 1, clockInTime: -1 });
ShiftSchema.index({ status: 1 });

module.exports = mongoose.model('Shift', ShiftSchema);
