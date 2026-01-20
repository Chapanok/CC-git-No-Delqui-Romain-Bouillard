// src/models/user.js
const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, default: '' },

  // === VÉRIFICATION EMAIL ===
  emailVerified: { type: Boolean, default: false },
  firebaseUid: { type: String, default: null }, // UID Firebase pour lier les comptes

  // plans: free | pro | premium
  plan: { type: String, enum: ['free','pro','premium'], default: 'free' },

  // (si tu as déjà isPremium/premiumUntil, garde-les ; on calcule aussi via le plan)
  isPremium: { type: Boolean, default: false },
  premiumUntil: { type: Date, default: null },

  // === QUOTAS GÉNÉRATION (source of truth côté serveur) ===
  // Nombre de générations utilisées aujourd'hui
  generationCount: { type: Number, default: 0, min: 0 },

  // Générations bonus (gagnées via pub/promo/etc.)
  bonusGenerations: { type: Number, default: 0, min: 0 },

  // Nombre de pubs regardées aujourd'hui (pour limiter le farm)
  adsWatchedToday: { type: Number, default: 0, min: 0 },

  // Date du dernier reset (format: "2024-01-15" via toDateString())
  // Permet de détecter le changement de jour côté serveur
  lastResetDate: { type: String, default: () => new Date().toDateString() },

  // autres...
}, { timestamps: true });

// 💡 Performance: Ajout d'index pour optimiser les recherches fréquentes
userSchema.index({ email: 1 }); // <- Déjà implicite par unique:true, mais bonne pratique
userSchema.index({ plan: 1 }); // <- Utile si on filtre ou agrège par plan
userSchema.index({ lastResetDate: 1 }); // <- Pour le reset quotidien
userSchema.index({ firebaseUid: 1 }); // <- Pour recherche par UID Firebase

// === MÉTHODES D'INSTANCE ===

/**
 * Reset quotidien si le jour a changé
 * Appelé avant chaque vérification de quota
 */
userSchema.methods.resetDailyIfNeeded = async function() {
  const today = new Date().toDateString();

  if (this.lastResetDate !== today) {
    this.generationCount = 0;
    this.bonusGenerations = 0;
    this.adsWatchedToday = 0;
    this.lastResetDate = today;
    await this.save();
  }
};

/**
 * Calcule les générations restantes
 * @returns {number} -1 si premium (illimité), sinon nombre restant
 */
userSchema.methods.getRemainingGenerations = function() {
  if (this.plan === 'premium' || this.isPremium) {
    return -1; // illimité
  }

  const base = 3; // 3 générations de base par jour
  const max = base + (this.bonusGenerations || 0);
  const remaining = Math.max(0, max - (this.generationCount || 0));

  return remaining;
};

/**
 * Consomme une génération (décrémente le quota)
 * @returns {boolean} true si succès, false si quota dépassé
 */
userSchema.methods.consumeGeneration = async function() {
  // Premium = illimité
  if (this.plan === 'premium' || this.isPremium) {
    return true;
  }

  const base = 3;
  const max = base + (this.bonusGenerations || 0);

  if (this.generationCount >= max) {
    return false; // quota épuisé
  }

  this.generationCount += 1;
  await this.save();

  return true;
};

/**
 * Ajoute une génération bonus (récompense pub/promo)
 * @param {number} amount - Nombre de bonus à ajouter (défaut: 1)
 */
userSchema.methods.addBonusGeneration = async function(amount = 1) {
  this.bonusGenerations = (this.bonusGenerations || 0) + amount;
  await this.save();
};

// export direct du modèle (CommonJS)
module.exports = mongoose.model('User', userSchema);