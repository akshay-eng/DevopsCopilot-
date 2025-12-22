const mongoose = require('mongoose');

const onboardingResponseSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  foundUsThrough: {
    type: String,
    enum: [
      'google-search',
      'social-media',
      'friend-referral',
      'blog-article',
      'youtube',
      'github',
      'conference',
      'other'
    ],
    required: true
  },
  otherSource: {
    type: String
  },
  feedback: {
    type: String,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('OnboardingResponse', onboardingResponseSchema);
