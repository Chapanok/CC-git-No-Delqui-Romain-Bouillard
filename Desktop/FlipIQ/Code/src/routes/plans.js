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
    const u = await User.findById(req.user.uid).select('plan');
    if (!u) return res.status(404).json({ message: 'User not found' });
    res.json({ plan: u.plan || 'free' });
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

    await User.updateOne(
      { _id: req.user.uid },
      {
        $set: {
          plan: planId,
          // Optionnel : garder un booléen cohérent si tu l'utilises ailleurs
          isPremium: ['pro', 'premium'].includes(planId)
        }
      }
    );

    res.json({ ok: true, plan: planId });
  } catch (e) {
    console.error('[plans/select]', e);
    res.status(500).json({ message: 'Failed to update plan' });
  }
});

module.exports = router; // export direct du router (middleware function)
