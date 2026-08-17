const mongoose = require('mongoose');

const IngredientSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  unit: { type: String, required: true }, // e.g., 'kg', 'g', 'L', 'ml', 'pcs'
  currentStock: { type: Number, default: 0 },
  minimumStock: { type: Number, default: 0 }, // threshold for low-stock alerts
  costPerUnit: { type: Number, default: 0 },
  lastRestockedAt: { type: Date },
}, { timestamps: true });

IngredientSchema.index({ currentStock: 1 });
module.exports = mongoose.model('Ingredient', IngredientSchema);
