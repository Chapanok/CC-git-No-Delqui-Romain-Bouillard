// backend/src/routes/health.js
'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Mapping des états de connexion Mongoose
const MONGO_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

router.get('/', async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const isMongoOk = mongoState === 1; // 1 = Connected

  // 💡 Observabilité: On vérifie si les services critiques sont là
  const healthStatus = {
    status: isMongoOk ? 'ok' : 'error',
    uptime: process.uptime(), // Temps en secondes depuis le démarrage
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: isMongoOk ? 'healthy' : 'unhealthy',
        state: MONGO_STATES[mongoState] || 'unknown',
      },
      // On vérifie juste la présence des clés, pas l'appel réseau (trop lent pour un healthcheck)
      integrations: {
        openai: !!process.env.OPENAI_API_KEY,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        google_vision: !!process.env.GOOGLE_VISION_API_KEY,
      }
    },
    memory: process.memoryUsage(), // Utile pour détecter les fuites mémoire
    env: process.env.NODE_ENV || 'development',
    requestId: req.reqId || null
  };

  // 💡 Stabilité: Si la DB est HS, on renvoie 503.
  // Les load balancers (AWS, Railway, K8s) arrêteront d'envoyer du trafic ici.
  if (!isMongoOk) {
    return res.status(503).json(healthStatus);
  }

  return res.status(200).json(healthStatus);
});

module.exports = router;