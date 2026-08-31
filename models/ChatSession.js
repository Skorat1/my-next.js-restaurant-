const mongoose = require('mongoose');

const ChatSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  customerName: {
    type: String,
    default: 'Guest Customer',
  },
  status: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active',
  },
  lastMessage: {
    type: String,
    default: '',
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.models.ChatSession || mongoose.model('ChatSession', ChatSessionSchema);
