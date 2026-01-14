// src/firebaseAdmin.js
'use strict';

const admin = require('firebase-admin');

let firebaseInitialized = false;
let initError = null;

/**
 * Parse Firebase private key from environment variable
 * Handles both direct PEM format and base64-encoded keys
 */
function parsePrivateKey(rawKey) {
  if (!rawKey) {
    throw new Error('FIREBASE_PRIVATE_KEY is missing from environment variables');
  }

  let key = rawKey;

  // Replace escaped newlines with actual newlines
  if (key.includes('\\n')) {
    key = key.replace(/\\n/g, '\n');
  }

  // If key doesn't have PEM headers, try base64 decoding
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    try {
      key = Buffer.from(rawKey, 'base64').toString('utf-8');
    } catch (e) {
      throw new Error('Failed to decode base64 private key');
    }
  }

  // Validate PEM format
  if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Invalid PEM format for Firebase private key');
  }

  return key;
}

/**
 * Initialize Firebase Admin SDK (lazy initialization)
 * Only called when actually needed
 */
function initFirebase() {
  if (firebaseInitialized) return;

  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

    // Check if Firebase is configured
    if (!projectId || !clientEmail || !privateKeyRaw) {
      console.warn('⚠️  Firebase Admin not configured (missing env vars). Firebase features disabled.');
      initError = new Error('Firebase not configured');
      firebaseInitialized = true; // Mark as "initialized" to avoid retry loops
      return;
    }

    const privateKey = parsePrivateKey(privateKeyRaw);

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });

    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error.message);
    initError = error;
    firebaseInitialized = true; // Prevent infinite retry loops
  }
}

/**
 * Proxy for Firebase Admin Auth
 * Ensures Firebase is initialized before any auth operation
 */
const adminAuthProxy = {
  verifyIdToken: async (idToken) => {
    initFirebase();

    if (initError) {
      throw new Error(`Firebase Admin not available: ${initError.message}`);
    }

    return admin.auth().verifyIdToken(idToken);
  },

  getUser: async (uid) => {
    initFirebase();

    if (initError) {
      throw new Error(`Firebase Admin not available: ${initError.message}`);
    }

    return admin.auth().getUser(uid);
  },

  createUser: async (properties) => {
    initFirebase();

    if (initError) {
      throw new Error(`Firebase Admin not available: ${initError.message}`);
    }

    return admin.auth().createUser(properties);
  },

  updateUser: async (uid, properties) => {
    initFirebase();

    if (initError) {
      throw new Error(`Firebase Admin not available: ${initError.message}`);
    }

    return admin.auth().updateUser(uid, properties);
  },

  deleteUser: async (uid) => {
    initFirebase();

    if (initError) {
      throw new Error(`Firebase Admin not available: ${initError.message}`);
    }

    return admin.auth().deleteUser(uid);
  }
};

/**
 * Check if Firebase is ready (for health checks)
 */
function isFirebaseReady() {
  return firebaseInitialized && !initError;
}

/**
 * Get Firebase initialization error (for debugging)
 */
function getFirebaseError() {
  return initError;
}

module.exports = {
  adminAuth: adminAuthProxy,
  isFirebaseReady,
  getFirebaseError
};
