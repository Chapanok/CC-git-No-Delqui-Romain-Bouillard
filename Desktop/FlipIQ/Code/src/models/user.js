// src/models/user.js
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, default: '' },

  // plans: free | pro | premium
  plan: { type: String, enum: ['free','pro','premium'], default: 'free' },

  // (si tu as déjà isPremium/premiumUntil, garde-les ; on calcule aussi via le plan)
  isPremium: { type: Boolean, default: false },
  premiumUntil: { type: Date, default: null },

  // autres...
}, { timestamps: true });

// 💡 Performance: Ajout d'index pour optimiser les recherches fréquentes
userSchema.index({ email: 1 }); // <- Déjà implicite par unique:true, mais bonne pratique
userSchema.index({ plan: 1 }); // <- Utile si on filtre ou agrège par plan

// export direct du modèle (CommonJS)
module.exports = mongoose.model('User', userSchema);