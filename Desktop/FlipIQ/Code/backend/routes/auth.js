// backend/routes/auth.js
'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// ============================================
// HELPERS
// ============================================

const normalizeEmail = (e = '') => e.trim().toLowerCase();

/**
 * Génère un JWT avec userId
 * Expire dans 7 jours
 */
const sign = (userId) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
};

// ============================================
// GOOGLE OAUTH
// ============================================

const GOOGLE_AUDIENCE = [
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
].filter(Boolean);

const googleClient = new OAuth2Client();

/**
 * POST /api/auth/google
 * Body: { idToken: string }
 *
 * Vérifie le Google Sign-In idToken
 * Trouve ou crée l'utilisateur dans MongoDB
 * Renvoie un JWT
 */
router.post('/google', async (req, res) => {
  try {
    const idToken = String(req.body?.idToken || '');
    if (!idToken) {
      return res.status(400).json({ message: 'Missing idToken' });
    }

    if (!GOOGLE_AUDIENCE.length) {
      console.error('GOOGLE_WEB_CLIENT_ID not configured');
      return res.status(500).json({ message: 'Server missing Google client IDs' });
    }

    // Vérifier le token avec Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_AUDIENCE,
    });

    const payload = ticket.getPayload();
    const email = normalizeEmail(payload?.email || '');

    if (!email) {
      return res.status(400).json({ message: 'Google account has no email' });
    }

    // Trouver ou créer l'utilisateur
    let user = await User.findOne({ email });

    if (!user) {
      // Créer un nouveau user
      user = await User.create({
        email,
        password: await bcrypt.hash(jwt.sign({ seed: email }, process.env.JWT_SECRET), 10), // placeholder
        firstName: payload?.given_name || '',
        lastName: payload?.family_name || '',
        name: `${payload?.given_name || ''} ${payload?.family_name || ''}`.trim() || email,
      });
    }

    // Générer JWT
    const token = sign(user._id.toString());

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        plan: user.plan,
      },
    });
  } catch (err) {
    console.error('[Google OAuth] error:', err?.response?.data || err?.message || err);
    res.status(401).json({ message: 'Google sign-in failed' });
  }
});

// ============================================
// EMAIL/PASSWORD AUTHENTICATION
// ============================================

/**
 * POST /api/auth/signup
 * Body: { email, password, name?, firstName?, lastName? }
 *
 * Crée un nouveau compte avec email/password
 */
router.post('/signup', async (req, res) => {
  try {
    let { email, password, name, firstName, lastName } = req.body || {};
    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: 'Email is already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const doc = {
      email,
      password: passwordHash,
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
    };

    const fn = doc.firstName || '';
    const ln = doc.lastName || '';
    doc.name = (name || `${fn} ${ln}`).trim() || email;

    const user = await User.create(doc);
    const token = sign(user._id.toString());

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        plan: user.plan,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Signup failed' });
  }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 *
 * Connexion avec email/password
 */
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = sign(user._id.toString());

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        plan: user.plan,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

// ============================================
// USER PROFILE
// ============================================

/**
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 *
 * Récupère le profil de l'utilisateur connecté
 */
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('_id email name firstName lastName plan');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      plan: user.plan,
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

module.exports = router;
