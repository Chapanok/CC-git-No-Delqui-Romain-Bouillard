const jwt = require('jsonwebtoken');
const { JWT_SECRET = '' } = process.env;

function signJwt(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d', ...options });
}

function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { signJwt, verifyJwt };
