const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const User = require('../models/User');
const CampaignWorkflow = require('../models/CampaignWorkflow');
const CampaignAnalytics = require('../models/CampaignAnalytics');

// @route   GET /api/crm/segments
// @desc    Get dynamic audience segments based on RFM and metrics
// @access  Private/Admin
router.get('/segments', auth, admin, async (req, res) => {
  try {
    const filters = req.query; // { minSpend, minVisits, daysSinceLastVisit, tier, tags }
    const query = { role: 'customer' };

    if (filters.minSpend) query.totalSpent = { $gte: Number(filters.minSpend) };
    if (filters.minVisits) query.totalOrders = { $gte: Number(filters.minVisits) };
    if (filters.tier) query['membership.tier'] = filters.tier;
    if (filters.tags) query.tags = { $in: filters.tags.split(',') };
    
    if (filters.daysSinceLastVisit) {
      const dateTarget = new Date();
      dateTarget.setDate(dateTarget.getDate() - Number(filters.daysSinceLastVisit));
      // For "Lapsed VIPs", we want lastVisitDate to be LESS than (older than) the dateTarget
      query.lastVisitDate = { $lt: dateTarget };
    }

    const matchingUsers = await User.find(query).select('-password');
    res.json({
      count: matchingUsers.length,
      users: matchingUsers
    });
  } catch (err) {
    console.error('CRM Segments error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/crm/workflows
// @desc    Get all campaign workflows
// @access  Private/Admin
router.get('/workflows', auth, admin, async (req, res) => {
  try {
    const workflows = await CampaignWorkflow.find().sort({ createdAt: -1 });
    res.json(workflows);
  } catch (err) {
    console.error('Workflows fetch error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/crm/workflows
// @desc    Create a new campaign workflow
// @access  Private/Admin
router.post('/workflows', auth, admin, async (req, res) => {
  try {
    const newWorkflow = new CampaignWorkflow(req.body);
    const workflow = await newWorkflow.save();
    
    // Auto-create an analytics document for it
    const analytics = new CampaignAnalytics({ campaignId: workflow._id });
    await analytics.save();

    res.json(workflow);
  } catch (err) {
    console.error('Workflow creation error:', err);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/crm/analytics
// @desc    Get aggregated campaign analytics
// @access  Private/Admin
router.get('/analytics', auth, admin, async (req, res) => {
  try {
    const analytics = await CampaignAnalytics.find().populate('campaignId', 'name triggerType');
    res.json(analytics);
  } catch (err) {
    console.error('Analytics fetch error:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
