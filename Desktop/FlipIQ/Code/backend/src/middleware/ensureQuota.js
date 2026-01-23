// backend/src/middleware/ensureQuota.js
'use strict';

const User = require('../models/user');

/**
 * Middleware qui vérifie et consomme un quota de génération
 *
 * Prérequis: requireAuth doit être appelé AVANT ce middleware
 * (pour que req.user.uid existe)
 *
 * Logique:
 * 1. Charge l'utilisateur depuis req.user.uid
 * 2. Reset quotidien si nécessaire
 * 3. Premium => autorise sans décrémenter
 * 4. Sinon => vérifie quota disponible
 * 5. Si quota OK => décrémente et continue
 * 6. Si quota épuisé => retourne 429
 */
async function ensureQuota(req, res, next) {
  try {
    const userId = req.user?.uid || req.user?.sub || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: 'unauthorized',
        message: 'Authentication required'
      });
    }

    // Charger l'utilisateur
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'user_not_found',
        message: 'User not found'
      });
    }

    // Reset quotidien si nécessaire
    await user.resetDailyIfNeeded();

    // Premium = illimité (pas de décrément)
    if (user.plan === 'premium' || user.isPremium) {
      req.quota = {
        consumed: false,
        remaining: -1,
        isPremium: true
      };
      return next();
    }

    // Vérifier quota disponible
    const remaining = user.getRemainingGenerations();

    if (remaining <= 0) {
      return res.status(429).json({
        ok: false,
        error: 'quota_exceeded',
        message: 'Daily generation quota exceeded',
        quota: {
          used: user.generationCount,
          max: 3 + user.bonusGenerations,
          remaining: 0,
          resetAt: getNextResetTime()
        }
      });
    }

    // Consommer UNE génération
    const consumed = await user.consumeGeneration();

    if (!consumed) {
      return res.status(429).json({
        ok: false,
        error: 'quota_exceeded',
        message: 'Daily generation quota exceeded'
      });
    }

    // Attacher info quota à la requête (pour logging/stats)
    req.quota = {
      consumed: true,
      remaining: user.getRemainingGenerations(),
      isPremium: false
    };

    next();

  } catch (err) {
    console.error('[ensureQuota] error:', err);
    res.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Failed to check quota'
    });
  }
}

/**
 * Helper: calcule l'heure du prochain reset (minuit)
 */
function getNextResetTime() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

module.exports = { ensureQuota };
