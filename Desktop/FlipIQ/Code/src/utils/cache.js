// backend/src/utils/cache.js
'use strict';

const NodeCache = require('node-cache');

// TTL standard : 1 heure pour la vision, 24h pour les prix
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

module.exports = {
  get: (key) => cache.get(key),
  set: (key, value, ttl) => cache.set(key, value, ttl),
  del: (key) => cache.del(key),
  flush: () => cache.flushAll(),
  
  // Helpers de clés
  keyVision: (hash) => `vision:${hash}`,
  keyPrice: (query) => `price:${String(query).trim().toLowerCase()}`
};