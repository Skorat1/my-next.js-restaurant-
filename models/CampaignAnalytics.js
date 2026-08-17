const mongoose = require('mongoose');

const campaignAnalyticsSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignWorkflow', required: true },
  
  // Delivery metrics
  metrics: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    clicked: { type: Number, default: 0 },
    optOuts: { type: Number, default: 0 }
  },
  
  // ROI & Attribution
  attribution: {
    reservationsMade: { type: Number, default: 0 },
    couponsRedeemed: { type: Number, default: 0 },
    totalRevenueGenerated: { type: Number, default: 0 } // Tracks actual ₹₹ generated
  },
  
  date: { type: Date, default: Date.now }
}, { timestamps: true });

campaignAnalyticsSchema.index({ campaignId: 1 });
campaignAnalyticsSchema.index({ date: -1 });

module.exports = mongoose.model('CampaignAnalytics', campaignAnalyticsSchema);
