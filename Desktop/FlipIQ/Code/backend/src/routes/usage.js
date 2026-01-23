// backend/src/routes/usage.js
'use strict';

const express = require('express');
const User = require('../models/user');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Configuration limites publicités
const MAX_ADS_PER_DAY = 10; // Maximum 10 pubs par jour
const BONUS_PER_AD = 1; // 1 génération bonus par pub

/**
 * GET /api/usage
 * Retourne les stats d'utilisation de l'utilisateur connecté
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.sub || req.user?._id;

    const user = await User.findById(userId).select(
      'plan isPremium generationCount bonusGenerations adsWatchedToday lastResetDate'
    );

    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'user_not_found',
        message: 'User not found'
      });
    }

    // Reset quotidien si nécessaire
    await user.resetDailyIfNeeded();

    const remaining = user.getRemainingGenerations();
    const isPremium = user.plan === 'premium' || user.isPremium;

    res.json({
      ok: true,
      usage: {
        plan: user.plan,
        isPremium,
        generationCount: user.generationCount,
        bonusGenerations: user.bonusGenerations,
        remainingGenerations: remaining,
        maxGenerations: isPremium ? -1 : (3 + user.bonusGenerations),
        adsWatchedToday: user.adsWatchedToday,
        maxAdsPerDay: MAX_ADS_PER_DAY,
        lastResetDate: user.lastResetDate,
        nextReset: getNextResetTime()
      }
    });

  } catch (err) {
    console.error('[usage/get] error:', err);
    res.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Failed to fetch usage stats'
    });
  }
});

/**
 * POST /api/usage/ads/reward
 * Ajoute une génération bonus après visionnage d'une pub
 *
 * Limite: MAX_ADS_PER_DAY pubs par jour
 */
router.post('/ads/reward', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.sub || req.user?._id;

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

    // Vérifier limite quotidienne de pubs
    if (user.adsWatchedToday >= MAX_ADS_PER_DAY) {
      return res.status(429).json({
        ok: false,
        error: 'ads_limit_reached',
        message: `Maximum ${MAX_ADS_PER_DAY} ads per day`,
        usage: {
          adsWatchedToday: user.adsWatchedToday,
          maxAdsPerDay: MAX_ADS_PER_DAY,
          nextReset: getNextResetTime()
        }
      });
    }

    // Premium n'a pas besoin de bonus (déjà illimité)
    if (user.plan === 'premium' || user.isPremium) {
      return res.json({
        ok: true,
        message: 'Premium users have unlimited generations',
        usage: {
          plan: user.plan,
          isPremium: true,
          remainingGenerations: -1
        }
      });
    }

    // Incrémenter compteur de pubs
    user.adsWatchedToday += 1;

    // Ajouter génération bonus
    await user.addBonusGeneration(BONUS_PER_AD);

    res.json({
      ok: true,
      message: `${BONUS_PER_AD} bonus generation(s) added`,
      reward: {
        bonusAdded: BONUS_PER_AD,
        totalBonus: user.bonusGenerations,
        adsWatchedToday: user.adsWatchedToday,
        maxAdsPerDay: MAX_ADS_PER_DAY,
        remainingGenerations: user.getRemainingGenerations()
      }
    });

  } catch (err) {
    console.error('[usage/ads/reward] error:', err);
    res.status(500).json({
      ok: false,
      error: 'server_error',
      message: 'Failed to process ad reward'
    });
  }
});

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

module.exports = router;
