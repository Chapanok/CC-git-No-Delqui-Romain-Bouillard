// src/routes/plans.js
// backend/src/routes/plans.js
const express = require('express');
// ⚠️ chemins corrigés
const User = require('../models/user');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();


const PLANS = [
  { id: 'free',    name: 'Free',    priceMonthly: 0,    features: ['Basic generator','Up to 5 listings'] },
  { id: 'pro',     name: 'Pro',     priceMonthly: 9.99, features: ['AI insights','Unlimited listings','Priority support'] },
  { id: 'premium', name: 'Premium', priceMonthly: 19.99, features: ['Everything unlimited','Faster AI','VIP support'] },
];

// Liste des plans
router.get('/', (_req, res) => res.json({ plans: PLANS }));

// Plan actuel de l'utilisateur connecté
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.uid || req.user?.sub || req.user?._id;
    const u = await User.findById(userId).select('plan isPremium generationCount bonusGenerations lastResetDate');
    if (!u) return res.status(404).json({ message: 'User not found' });

    // Reset quotidien si nécessaire
    await u.resetDailyIfNeeded();

    const remaining = u.getRemainingGenerations();
    const isPremium = u.plan === 'premium' || u.isPremium;

    res.json({
      plan: u.plan || 'free',
      isPremium,
      remainingGenerations: remaining,
      maxGenerations: isPremium ? -1 : (3 + u.bonusGenerations)
    });
  } catch (e) {
    console.error('[plans/me]', e);
    res.status(500).json({ message: 'Failed to fetch plan' });
  }
});

// Sélection d'un plan pour l'utilisateur connecté
router.post('/select', requireAuth, async (req, res) => {
  try {
    const { planId } = req.body || {};
    const valid = PLANS.find(p => p.id === planId);
    if (!valid) return res.status(400).json({ message: 'Invalid plan' });

    // 🔒 SÉCURITÉ: Empêcher l'escalade vers premium sans paiement
    if (planId === 'premium' || planId === 'pro') {
      // TODO: Vérifier ici le statut de paiement/abonnement Stripe/PayPal
      // Pour l'instant, on bloque toute tentative de mise à niveau payante
      return res.status(403).json({
        ok: false,
        error: 'payment_required',
        message: 'Premium/Pro plans require valid payment. Please complete payment first.'
      });
    }

    // Autoriser uniquement le downgrade vers free (ou upgrade avec paiement vérifié)
    const userId = req.user?.uid || req.user?.sub || req.user?._id;
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          plan: planId,
          isPremium: false // Reset premium status lors du downgrade
        }
      }
    );

    res.json({ ok: true, plan: planId });
  } catch (e) {
    console.error('[plans/select]', e);
    res.status(500).json({ message: 'Failed to update plan' });
  }
});

// ============================================================
// 🔒 SÉCURITÉ: mock-upgrade DÉSACTIVÉ EN PRODUCTION
// ============================================================
if (process.env.NODE_ENV !== 'production') {
  router.post('/mock-upgrade', requireAuth, async (req, res) => {
    try {
      const { planId } = req.body || {};

      if (!['pro', 'premium'].includes(planId)) {
        return res.status(400).json({
          ok: false,
          error: 'invalid_plan',
          message: 'Plan must be pro or premium'
        });
      }

      const userId = req.user?.uid || req.user?.sub || req.user?._id;

      await User.updateOne(
        { _id: userId },
        { $set: { plan: planId, isPremium: true } }
      );

      console.log(`[DEV ONLY] User ${userId} mock-upgraded to ${planId}`);

      res.json({
        ok: true,
        plan: planId,
        isPremium: true,
        message: 'DEV ONLY: Mock payment OK'
      });
    } catch (e) {
      console.error('[plans/mock-upgrade]', e);
      res.status(500).json({ ok: false, message: 'Failed to upgrade plan' });
    }
  });
}
// ============================================================

// ============================================================
// 🧪 ENDPOINT DE TEST: Disponible tout le temps (pour Railway/tests)
// ============================================================
router.post('/test-upgrade', requireAuth, async (req, res) => {
  try {
    const { planId } = req.body || {};

    if (!['pro', 'premium', 'free'].includes(planId)) {
      return res.status(400).json({
        ok: false,
        error: 'invalid_plan',
        message: 'Plan must be free, pro or premium'
      });
    }

    const userId = req.user?.uid || req.user?.sub || req.user?._id;

    const isPremium = ['pro', 'premium'].includes(planId);

    await User.updateOne(
      { _id: userId },
      { $set: { plan: planId, isPremium } }
    );

    console.log(`[TEST] User ${userId} upgraded to ${planId}`);

    res.json({
      ok: true,
      plan: planId,
      isPremium,
      message: 'TEST: Plan updated successfully'
    });
  } catch (e) {
    console.error('[plans/test-upgrade]', e);
    res.status(500).json({ ok: false, message: 'Failed to upgrade plan' });
  }
});
// ============================================================

module.exports = router; // export direct du router (middleware function)
