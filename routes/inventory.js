const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Ingredient = require('../models/Ingredient');
const Recipe = require('../models/Recipe');
const WastageLog = require('../models/WastageLog');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// ----------------- INGREDIENTS -----------------
router.get('/ingredients', auth, admin, async (req, res) => {
  try {
    const ingredients = await Ingredient.find().sort({ name: 1 });
    res.json(ingredients);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

router.post('/ingredients', auth, admin, async (req, res) => {
  try {
    const newIngredient = new Ingredient(req.body);
    await newIngredient.save();
    res.json(newIngredient);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

router.put('/ingredients/:id/stock', auth, admin, async (req, res) => {
  try {
    const { addedStock, costPerUnit } = req.body;
    const ingredient = await Ingredient.findById(req.params.id);
    if (!ingredient) return res.status(404).json({ msg: 'Ingredient not found' });
    
    ingredient.currentStock += addedStock;
    if (costPerUnit) ingredient.costPerUnit = costPerUnit;
    ingredient.lastRestockedAt = new Date();
    await ingredient.save();
    
    res.json(ingredient);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ----------------- RECIPES -----------------
router.get('/recipes', auth, admin, async (req, res) => {
  try {
    const recipes = await Recipe.find().populate('menuItem', 'name price').populate('ingredients.ingredient', 'name unit costPerUnit');
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

router.post('/recipes', auth, admin, async (req, res) => {
  try {
    const { menuItem, ingredients, instructions } = req.body;
    let recipe = await Recipe.findOne({ menuItem });
    if (recipe) {
      recipe.ingredients = ingredients;
      recipe.instructions = instructions;
    } else {
      recipe = new Recipe({ menuItem, ingredients, instructions });
    }
    await recipe.save();
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

// ----------------- WASTAGE -----------------
router.get('/wastage', auth, admin, async (req, res) => {
  try {
    const logs = await WastageLog.find().populate('ingredient', 'name unit').populate('reportedBy', 'name').sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ msg: 'Server Error' });
  }
});

router.post('/wastage', auth, admin, async (req, res) => {
  try {
    const { ingredient, quantity, reason } = req.body;
    const log = new WastageLog({ ingredient, quantity, reason, reportedBy: req.user._id });
    await log.save();
    
    await Ingredient.findByIdAndUpdate(ingredient, { $inc: { currentStock: -quantity } });
    
    res.json(log);
  } catch (err) {
    res.status(500).json({ msg: err.message });
  }
});

module.exports = router;
