// backend/src/middleware/auth.js
'use strict';

const { verifyJwt } = require('../utils/jwt');

const { COOKIE_NAME = 'flip_auth' } = process.env;

function getTokenFromReq(req) {
  // 1) cookie
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) return cookieToken;
  // 2) bearer
  const h = req.headers['authorization'] || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7);
  return null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  
  req.user = payload;
  next();
}

// Export propre pour éviter les erreurs d'import
module.exports = { requireAuth, getTokenFromReq };