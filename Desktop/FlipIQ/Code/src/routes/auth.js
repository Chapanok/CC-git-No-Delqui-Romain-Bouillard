// backend/src/routes/auth.js
'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// modele utilisateur (depuis backend/models/users.js)
const User = require('../models/user');


const router = express.Router();

function getJwtSecret() {
  const secret = process.env.jwt_secret || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('jwt_secret manquant dans le .env');
  }
  return secret;
}

// formater l utilisateur retourne au front
function toPublicUser(user) {
  return {
    id: user._id,
    email: user.email,
    name: user.name || '',
    plan: user.plan || 'free',
    isPremium: !!user.isPremium,
    premiumUntil: user.premiumUntil || null,
  };
}

/**
 * POST /api/auth/register
 * body JSON : { "email": "...", "password": "...", "name": "..." }
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: 'email_et_password_requis' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res
        .status(400)
        .json({ ok: false, error: 'email_deja_utilise' });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email,
      password: hash,
      name: name || '',
      // plan, isPremium, premiumUntil utilisent les valeurs par defaut du schema
    });

    return res.status(201).json({
      ok: true,
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error('erreur /api/auth/register :', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * POST /api/auth/login
 * body JSON : { "email": "...", "password": "..." }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: 'email_et_password_requis' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ ok: false, error: 'credentials_invalides' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res
        .status(401)
        .json({ ok: false, error: 'credentials_invalides' });
    }

    const secret = getJwtSecret();

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        email: user.email,
        plan: user.plan,
      },
      secret,
      { expiresIn: '7d' }
    );

    return res.json({
      ok: true,
      token,
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error('erreur /api/auth/login :', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * middleware simple pour /api/auth/me
 */
function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [, token] = header.split(' ');

    if (!token) {
      return res.status(401).json({ ok: false, error: 'token_manquant' });
    }

    const secret = getJwtSecret();
    const payload = jwt.verify(token, secret);
    req.user = payload;
    next();
  } catch (err) {
    console.error('erreur authMiddleware :', err);
    return res.status(401).json({ ok: false, error: 'token_invalide' });
  }
}

/**
 * GET /api/auth/me
 * header : Authorization: Bearer <token>
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'user_not_found' });
    }
    return res.json({ ok: true, user: toPublicUser(user) });
  } catch (err) {
    console.error('erreur /api/auth/me :', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

module.exports = router;
