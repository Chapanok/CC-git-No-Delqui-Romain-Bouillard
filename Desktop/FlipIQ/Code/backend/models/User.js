// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true
    }, // bcrypt hash
    name: {
      type: String,
      default: ''
    },
    firstName: {
      type: String,
      default: ''
    },
    lastName: {
      type: String,
      default: ''
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'premium'],
      default: 'free'
    },
    // RevenueCat subscription fields (optionnel)
    isPro: {
      type: Boolean,
      default: false
    },
    proExpiresAt: {
      type: Date,
      default: null
    },
  },
  {
    timestamps: true // createdAt, updatedAt auto
  }
);

// Index unique sur email est créé automatiquement par unique: true

module.exports = mongoose.model('User', userSchema);
