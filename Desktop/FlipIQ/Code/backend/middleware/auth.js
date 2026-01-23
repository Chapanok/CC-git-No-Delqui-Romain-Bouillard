// backend/middleware/auth.js
'use strict';

const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification JWT
 * Vérifie le token dans Authorization header (Bearer) ou x-auth-token
 * Attache userId et user à req
 */
module.exports = (req, res, next) => {
  try {
    let token = null;

    // 1) Standard Authorization header: Bearer <token>
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    // 2) Fallback header: x-auth-token
    if (!token && req.headers['x-auth-token']) {
      token = String(req.headers['x-auth-token']).trim();
    }

    if (!token) {
      return res.status(401).json({ message: 'Missing token' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET not configured');
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const payload = jwt.verify(token, secret);

    // Extraire userId du payload (supporte plusieurs formats)
    const userId =
      payload.userId ||
      payload.id ||
      payload._id ||
      payload.sub ||
      payload.user_id;

    if (!userId) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    req.userId = userId;
    req.user = payload;

    return next();
  } catch (e) {
    console.error('auth middleware error:', e.message);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
