// backend/src/app.js
'use strict';

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const morgan = require('morgan');
const crypto = require('node:crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const app = express();
app.set('trust proxy', 1);

// ====================================================================
// 1. CORS GLOBAL (IMPORTANT POUR flipiqapp.com)
// ====================================================================
app.use(function (req, res, next) {
  const origin = req.headers.origin || '';

  const allowedOrigins = [
    'https://flipiqapp.com',
    'https://www.flipiqapp.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  // pour que les caches respectent l'origine
  res.setHeader('Vary', 'Origin');

  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-Id'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // repondre aux preflight directement
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

// ====================================================================
// 2. SECURITE / LOGS / PERF
// ====================================================================

// id de requete
app.use(function (req, res, next) {
  const id =
    crypto.randomUUID && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');

  req.reqId = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// logs
app.use(
  morgan('dev', {
    skip: function (req) {
      // eviter de spammer avec /api/health
      return req.path === '/api/health';
    }
  })
);

// 🔒 SÉCURITÉ: Headers HTTP via Helmet
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://www.gstatic.com", "https://apis.google.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        connectSrc: ["'self'", "https://api.flipiqapp.com", "https://*.firebaseio.com", "https://*.googleapis.com", "wss://*.firebaseio.com"],
        frameSrc: ["'self'", "https://*.stripe.com", "https://*.paypal.com"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);

// limite globale simple
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

// compression
app.use(compression());

// ====================================================================
// 2.5 STRIPE WEBHOOK (AVANT le body parser JSON !)
// ====================================================================
// Le webhook Stripe DOIT recevoir le body brut pour vérifier la signature
app.post(
  '/api/payments/stripe/webhook',
  express.raw({ type: 'application/json' }),
  function (req, res) {
    // Charger le handler depuis payments.js
    const paymentsRoute = require('./routes/payments');
    if (typeof paymentsRoute.stripeWebhookHandler === 'function') {
      return paymentsRoute.stripeWebhookHandler(req, res);
    }
    return res.status(500).json({ error: 'Webhook handler not found' });
  }
);

// body / cookies
app.use(
  express.json({
    limit: '10mb'
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb'
  })
);
app.use(cookieParser());

// ====================================================================
// 3. ROUTES API
// ====================================================================
function useRoute(mountPath, relativePath) {
  const routerPath = path.join(__dirname, relativePath);
  const router = require(routerPath);
  app.use(mountPath, router);
}

useRoute('/api/health', './routes/health');
useRoute('/api/auth', './routes/auth');
useRoute('/api/plans', './routes/plans');
useRoute('/api/payments', './routes/payments');
useRoute('/api/pro', './routes/pro');
useRoute('/api/ai', './routes/ai');

// ====================================================================
// 4. 404 & GESTION D'ERREUR
// ====================================================================
app.use(function (req, res) {
  res.status(404).json({ ok: false, error: 'not_found' });
});

app.use(function (err, req, res, next) {
  console.error('[ERREUR]', err);
  res
    .status(err.status || 500)
    .json({ ok: false, error: 'server_error', details: err.message || '' });
});

module.exports = app;
