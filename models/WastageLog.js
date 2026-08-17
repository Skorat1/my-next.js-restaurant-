const mongoose = require('mongoose');

const WastageLogSchema = new mongoose.Schema({
  ingredient: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  quantity: { type: Number, required: true, min: 0 },
  reason: { type: String, required: true }, // e.g., 'Expired', 'Damaged', 'Spilled'
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

WastageLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WastageLog', WastageLogSchema);
