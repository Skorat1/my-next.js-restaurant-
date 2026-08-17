const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema({
  stepNumber: { type: Number, required: true },
  delayHours: { type: Number, default: 0 },
  channel: { type: String, enum: ['WhatsApp', 'SMS', 'Email'], default: 'WhatsApp' },
  templateType: { type: String, enum: ['Text', 'InteractiveButton', 'Catalog'], default: 'Text' },
  messageBody: { type: String, required: true },
  interactiveButtons: [{
    id: String,
    text: String,
    action: String
  }],
  isABTest: { type: Boolean, default: false },
  variantBBody: { type: String }
});

const workflowSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  triggerType: { 
    type: String, 
    enum: ['Birthday', 'FirstVisit', 'LapsedVIP', 'Feedback', 'CustomSegment'], 
    required: true 
  },
  segmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Segment' }, // Optional tie to a custom segment
  isActive: { type: Boolean, default: true },
  steps: [stepSchema]
}, { timestamps: true });

workflowSchema.index({ triggerType: 1 });
workflowSchema.index({ isActive: 1 });

module.exports = mongoose.model('CampaignWorkflow', workflowSchema);
