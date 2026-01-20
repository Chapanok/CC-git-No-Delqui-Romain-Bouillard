// backend/src/routes/auth.js
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

const User = require('../models/user');
const { adminAuth } = require('../firebaseAdmin');

const router = express.Router();

function getJwtSecret() {
  const secret = process.env.jwt_secret || process.env.JWT_SECRET;
  if (!secret) throw new Error('jwt_secret manquant dans le .env');
  return secret;
}

function toPublicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name || '',
    plan: user.plan || 'free',
    isPremium: !!user.isPremium,
    premiumUntil: user.premiumUntil || null,
    emailVerified: !!user.emailVerified,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'email_et_password_requis' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ ok: false, error: 'email_deja_utilise' });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hash,
      name: name || '',
      emailVerified: false, // Par défaut, l'email n'est pas vérifié
    });

    return res.status(201).json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    console.error('erreur /api/auth/register :', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'email_et_password_requis' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ ok: false, error: 'credentials_invalides' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'credentials_invalides' });
    }

    // Vérifier si l'email est vérifié
    if (!user.emailVerified) {
      return res.status(403).json({
        ok: false,
        error: 'email_non_verifie',
        message: 'Vérifie ton email avant de te connecter. Vérifie ta boîte mail.'
      });
    }

    const token = jwt.sign(
      { sub: user._id.toString(), email: user.email, plan: user.plan },
      getJwtSecret(),
      { expiresIn: '7d' }
    );

    return res.json({ ok: true, token, user: toPublicUser(user) });
  } catch (err) {
    console.error('erreur /api/auth/login :', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /api/auth/verify-email
 * body: { idToken }
 *
 * Synchronise la vérification Firebase → MongoDB
 * Appelé après que l'utilisateur a vérifié son email via Firebase
 */
router.post('/verify-email', async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ ok: false, error: 'idToken_requis' });
    }

    // Vérifier le token Firebase
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (firebaseErr) {
      console.error('Firebase verifyIdToken failed:', firebaseErr.message);

      if (firebaseErr.message && firebaseErr.message.includes('FIREBASE_')) {
        return res.status(500).json({
          ok: false,
          error: 'firebase_config_error',
          message: 'Service de vérification email indisponible'
        });
      }

      return res.status(401).json({
        ok: false,
        error: 'token_invalide',
        message: 'Token Firebase invalide ou expiré'
      });
    }

    // Vérifier que l'email est bien vérifié dans Firebase
    if (!decoded.email_verified) {
      return res.status(403).json({
        ok: false,
        error: 'email_non_verifie_firebase',
        message: 'Email pas encore vérifié dans Firebase'
      });
    }

    const email = decoded.email;
    if (!email) {
      return res.status(400).json({ ok: false, error: 'email_manquant' });
    }

    // Trouver l'utilisateur MongoDB correspondant
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        ok: false,
        error: 'user_not_found',
        message: 'Aucun compte trouvé avec cet email. Inscris-toi d\'abord.'
      });
    }

    // Mettre à jour MongoDB si pas déjà vérifié
    if (!user.emailVerified) {
      user.emailVerified = true;
      user.firebaseUid = decoded.uid; // Lier le compte Firebase
      await user.save();
      console.log(`✅ Email vérifié pour ${email}`);
    }

    return res.json({
      ok: true,
      emailVerified: true,
      message: 'Email vérifié avec succès'
    });
  } catch (err) {
    console.error('erreur /api/auth/verify-email :', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// GET /api/auth/me
function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');
    if (!token) return res.status(401).json({ ok: false, error: 'token_manquant' });

    const payload = jwt.verify(token, getJwtSecret());
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'token_invalide' });
  }
}

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ ok: false, error: 'user_not_found' });
    return res.json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
