const mongoose = require('mongoose');

const TableSchema = new mongoose.Schema({
  tableNumber: {
    type: Number,
    required: true,
    unique: true,
  },
  capacity: {
    type: Number,
    required: true,
    default: 2,
  },
  status: {
    type: String,
    enum: ['Available', 'Occupied', 'Reserved', 'Cleaning'],
    default: 'Available',
  },
  area: {
    type: String,
    enum: ['Main Room', 'Patio', 'Terrace', 'Lounge'],
    default: 'Main Room',
  },
  currentOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  qrCodeUrl: {
    type: String,
    // Will store the full URL that the QR code points to, e.g., https://domain.com/table/123
  }
}, { timestamps: true });

module.exports = mongoose.model('Table', TableSchema);
