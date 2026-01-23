// backend/src/firebaseAdmin.js
"use strict";

const admin = require("firebase-admin");

let _isInitialized = false;
let _initError = null;

/**
 * Parse la clé privée Firebase en gérant plusieurs formats:
 * - Avec vrais retours à la ligne \n
 * - Avec \\n littéraux (Railway, Heroku, etc.)
 * - Base64 encodé (optionnel)
 */
function parsePrivateKey(rawKey) {
  if (!rawKey) {
    throw new Error("FIREBASE_PRIVATE_KEY est vide");
  }

  // Si la clé contient \\n littéraux, les convertir en vrais \n
  let key = rawKey.replace(/\\n/g, "\n");

  // Vérifier que la clé a le format PEM correct
  if (!key.includes("-----BEGIN PRIVATE KEY-----")) {
    // Tenter de décoder depuis base64 (format alternatif)
    try {
      key = Buffer.from(rawKey, "base64").toString("utf-8");
    } catch (e) {
      throw new Error(
        "FIREBASE_PRIVATE_KEY ne contient pas de header PEM valide et n'est pas en base64"
      );
    }
  }

  // Validation finale
  if (
    !key.includes("-----BEGIN PRIVATE KEY-----") ||
    !key.includes("-----END PRIVATE KEY-----")
  ) {
    throw new Error("FIREBASE_PRIVATE_KEY : format PEM invalide");
  }

  return key;
}

/**
 * Initialise Firebase Admin de manière lazy et safe
 */
function initFirebase() {
  if (_isInitialized) return;
  if (_initError) throw _initError;

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !rawPrivateKey) {
      throw new Error(
        "Variables Firebase manquantes: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
      );
    }

    const privateKey = parsePrivateKey(rawPrivateKey);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId.trim(),
          clientEmail: clientEmail.trim(),
          privateKey,
        }),
      });
    }

    _isInitialized = true;
    console.log("✅ Firebase Admin initialisé avec succès");
  } catch (err) {
    _initError = err;
    console.error("❌ Erreur initialisation Firebase Admin:", err.message);
    throw err;
  }
}

/**
 * Proxy pour admin.auth() avec initialisation lazy
 */
const adminAuthProxy = {
  verifyIdToken: async (idToken) => {
    initFirebase();
    return admin.auth().verifyIdToken(idToken);
  },
  createUser: async (properties) => {
    initFirebase();
    return admin.auth().createUser(properties);
  },
  getUserByEmail: async (email) => {
    initFirebase();
    return admin.auth().getUserByEmail(email);
  },
  updateUser: async (uid, properties) => {
    initFirebase();
    return admin.auth().updateUser(uid, properties);
  },
  deleteUser: async (uid) => {
    initFirebase();
    return admin.auth().deleteUser(uid);
  },
  // Ajouter d'autres méthodes si nécessaire
};

module.exports = {
  adminAuth: adminAuthProxy,
  isFirebaseReady: () => _isInitialized,
  getFirebaseError: () => _initError,
};
