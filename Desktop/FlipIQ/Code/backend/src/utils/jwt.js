const jwt = require('jsonwebtoken');

// 🔒 SÉCURITÉ: Exiger JWT_SECRET valide (pas de fallback)
const { JWT_SECRET } = process.env;

if (!JWT_SECRET || JWT_SECRET.trim() === '') {
  throw new Error(
    '❌ FATAL: JWT_SECRET is required but not set in environment variables.\n' +
    'Add JWT_SECRET=your_secure_random_string to your .env file or Railway environment.\n' +
    'Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"'
  );
}

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
