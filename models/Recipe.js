const mongoose = require('mongoose');

const RecipeIngredientSchema = new mongoose.Schema({
  ingredient: { type: mongoose.Schema.Types.ObjectId, ref: 'Ingredient', required: true },
  quantity: { type: Number, required: true }, // quantity of the ingredient needed
}, { _id: false });

const RecipeSchema = new mongoose.Schema({
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Menu', required: true, unique: true },
  ingredients: [RecipeIngredientSchema],
  instructions: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Recipe', RecipeSchema);
