const mongoose = require('mongoose');
const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  inquiryType: { type: String, default: 'General Table Inquiry' },
  guests: { type: Number, default: 2 },
  eventDate: { type: String },
  preferredContact: { type: String, default: 'Email' },
  referenceCode: { type: String },
  message: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Declined'], default: 'Pending' },
  notes: { type: String, default: '' },
  adminReply: { type: String, default: '' },
  repliedAt: { type: Date }
}, { timestamps: true });

ContactSchema.index({ status: 1 });
ContactSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Contact', ContactSchema);