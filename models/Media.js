const mongoose = require('mongoose');

const MediaSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    type: {
      type: String,
      enum: ['video', 'podcast', 'livestream', 'article'],
      default: 'video',
    },
    category: {
      type: String,
      enum: ['Masterclass', 'Chef Series', 'Sommelier Vault', 'Live Kitchen', 'Food Journalism'],
      default: 'Chef Series',
    },
    videoUrl: { type: String, default: '' },
    audioUrl: { type: String, default: '' },
    thumbnail: { type: String, required: true },
    duration: { type: String, default: '15:00' },
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    host: { type: String, default: 'Executive Chef Antoine Laurent' },
    tags: [{ type: String }],
    isFeatured: { type: Boolean, default: false },
    isLive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Media', MediaSchema);
