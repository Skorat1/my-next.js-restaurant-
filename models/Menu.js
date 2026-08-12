const mongoose = require('mongoose');

const AddonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, default: 0 },
});

const OptionChoiceSchema = new mongoose.Schema({
  value: { type: String, required: true },
  price: { type: Number, default: 0 },
});

const OptionGroupSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "Spice Level", "Portion"
  required: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false },
  choices: [OptionChoiceSchema],
});

const MenuSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  available: { type: Boolean, default: true },
  premium: { type: Boolean, default: false },
  vegetarian: { type: Boolean, default: false },
  spicy: { type: Boolean, default: false },
  popular: { type: Boolean, default: false },
  isSpecial: { type: Boolean, default: false }, // dish of the day / special highlight
  dietary: [{ type: String, enum: ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Nut-Free'] }],
  tags: [{ type: String }],
  addons: [AddonSchema],
  optionGroups: [OptionGroupSchema],
});

MenuSchema.index({ category: 1 });
MenuSchema.index({ available: 1 });
MenuSchema.index({ price: 1 });
MenuSchema.index({ popular: 1 });
MenuSchema.index({ isSpecial: 1 });
MenuSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Menu', MenuSchema);
