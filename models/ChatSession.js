const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ['customer', 'admin'],
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const ChatSessionSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open',
  },
  messages: [MessageSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
ChatSessionSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('ChatSession', ChatSessionSchema);
