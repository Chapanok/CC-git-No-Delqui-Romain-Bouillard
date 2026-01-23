// backend/server.js
'use strict';
require('dotenv').config();

const http = require('http');
const mongoose = require('mongoose');
const app = require('./src/app');

// ========================================================
// 1. PORT (Railway fournit process.env.PORT automatiquement)
// ========================================================
const PORT = process.env.PORT || 3000;

// ========================================================
// 2. CONNEXION MONGODB
// ========================================================
const MONGO_URI = process.env.MONGO_URI;

async function connectMongo() {
  if (!MONGO_URI) {
    console.error('❌ ERREUR : MONGO_URI manquant dans les variables Railway (.env)');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connecté');
  } catch (err) {
    console.error('🔥 Erreur connexion MongoDB :', err);
    process.exit(1);
  }
}

// ========================================================
// 3. DÉMARRAGE DU SERVEUR HTTP
// ========================================================
async function startServer() {
  try {
    await connectMongo();

    const server = http.createServer(app);

    server.listen(PORT, '0.0.0.0', () => {
      console.log('🚀 Serveur FlipIQ démarré');
      console.log(`👉 Port : ${PORT}`);
      console.log('👉 API prête : https://api.flipiqapp.com');

      // debug utile: confirme en logs le commit railway
      console.log(`👉 Commit : ${process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown'}`);
    });

    // logs des erreurs serveur
    server.on('error', (err) => {
      console.error('🔥 Erreur serveur HTTP :', err);
    });

  } catch (err) {
    console.error('🔥 CRASH AU DÉMARRAGE :', err);
    process.exit(1);
  }
}

startServer();
