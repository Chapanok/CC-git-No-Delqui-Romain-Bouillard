// backend/server.js
'use strict';
require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const morgan = require('morgan');
const crypto = require('node:crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// --- 1. CONFIGURATION ---
const app = express();
// IMPORTANT : Utiliser le port fourni par Railway, sinon 5000 par défaut
const PORT = process.env.PORT || 3000; 

app.set('trust proxy', 1);

// --- 2. CORS (LE PLUS IMPORTANT) ---
// On force les headers manuellement pour être sûr à 100%
app.use((req, res, next) => {
    // Liste des origines autorisées
    const allowedOrigins = [
        'https://flipiqapp.com',
        'https://www.flipiqapp.com',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ];
    
    const origin = req.headers.origin;
    
    // Log pour debug (regardez vos logs Railway !)
    console.log(`📡 [REQ] ${req.method} ${req.url} | Origin: ${origin || 'Server/Postman'}`);

    if (allowedOrigins.includes(origin) || !origin) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Répondre OK immédiatement à la requête OPTIONS (Preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    next();
});

// --- 3. MIDDLEWARES ---
app.use(helmet.hidePoweredBy());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev')); // Logs colorés

// --- 4. ROUTES ---

// Route de Test (Healthcheck)
app.get('/api/health', (req, res) => {
    res.json({ ok: true, message: 'Backend is running correctly!' });
});

// Importation des routes (SANS try-catch pour voir les erreurs au démarrage)
console.log('🔄 Chargement des routes...');

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/plans', require('./src/routes/plans'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/pro', require('./src/routes/pro'));
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/usage', require('./src/routes/usage'));

console.log('✅ Toutes les routes sont chargées avec succès');

// 404 Handler
app.use((req, res) => {
    console.log(`❌ 404 Not Found: ${req.url}`);
    res.status(404).json({ ok: false, error: 'route_not_found', path: req.url });
});

// Global Error Handler (préserve CORS même en cas d'erreur)
app.use((err, req, res, next) => {
    console.error('💥 Erreur serveur:', err);

    // Les headers CORS sont déjà définis par le middleware précédent,
    // mais on s'assure qu'ils sont présents même en cas d'erreur
    const origin = req.headers.origin;
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

    const status = err.status || err.statusCode || 500;
    res.status(status).json({
        ok: false,
        error: 'server_error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// --- 5. BASE DE DONNÉES & DÉMARRAGE ---
const MONGO_URI = process.env.MONGO_URI;

async function start() {
    try {
        if (MONGO_URI) {
            await mongoose.connect(MONGO_URI);
            console.log('✅ MongoDB Connecté');
        } else {
            console.warn('⚠️ Pas de MONGO_URI');
        }

        const server = http.createServer(app);
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 SERVEUR DÉMARRÉ SUR LE PORT ${PORT}`);
            console.log(`👉 Prêt à recevoir les requêtes de https://flipiqapp.com`);
        });

    } catch (err) {
        console.error('🔥 CRASH AU DÉMARRAGE:', err);
    }
}

start();