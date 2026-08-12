const mongoose = require('mongoose');

const NewsletterSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  subscribedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Newsletter', NewsletterSchema);
