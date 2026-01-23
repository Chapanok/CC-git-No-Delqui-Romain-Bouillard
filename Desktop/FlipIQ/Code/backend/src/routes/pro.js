// src/routes/pro.js
const express = require('express');
const crypto = require('crypto');

let requireAuth = require('../middleware/auth');
if (requireAuth && requireAuth.requireAuth) requireAuth = requireAuth.requireAuth;

let fetchFn = globalThis.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}
const fetch = (...args) => fetchFn(...args);

const router = express.Router();

const {
  VINTED_PRO_ACCESS_KEY,
  VINTED_PRO_SECRET_KEY,
  VINTED_PRO_ACCOUNT_ID,
  VINTED_PRO_ENDPOINT,
} = process.env;

const hasVintedPro = Boolean(
  VINTED_PRO_ACCESS_KEY && VINTED_PRO_SECRET_KEY && VINTED_PRO_ACCOUNT_ID
);

const VINTED_ITEMS_ENDPOINT =
  VINTED_PRO_ENDPOINT || 'https://integrations.vinted.com/api/v2/items';

const CATEGORY_MAP = (() => {
  try {
    return JSON.parse(process.env.VINTED_PRO_CATEGORY_MAP || '{}');
  } catch {
    return {};
  }
})();

const SIZE_MAP = (() => {
  try {
    return JSON.parse(process.env.VINTED_PRO_SIZE_MAP || '{}');
  } catch {
    return {};
  }
})();

function signVintedRequest({ secret, method, path, timestamp, body }) {
  const payload = `${timestamp}${method.toUpperCase()}${path}${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function normalizePrice(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const clean = value.replace(/[^\d.,]/g, '').replace(',', '.');
    const num = Number(clean);
    if (Number.isFinite(num)) return num;
  }
  return null;
}

if (hasVintedPro) {
  router.post('/vinted/listings', requireAuth, async (req, res) => {
    try {
      const {
        title,
        description,
        price,
        currency = 'EUR',
        condition = 'good',
        categoryKey,
        sizeKey,
        photos = [],
        attributes = {},
      } = req.body || {};

      const normalizedPrice = normalizePrice(price);
      if (!title || !description || !normalizedPrice) {
        return res.status(400).json({ error: 'missing_fields' });
      }

      const endpointUrl = new URL(VINTED_ITEMS_ENDPOINT);
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const body = JSON.stringify({
        account_id: VINTED_PRO_ACCOUNT_ID,
        title,
        description,
        status: 'draft',
        price: {
          amount: normalizedPrice,
          currency,
        },
        condition,
        ...(categoryKey && CATEGORY_MAP[categoryKey]
          ? { category_id: CATEGORY_MAP[categoryKey] }
          : {}),
        ...(sizeKey && SIZE_MAP[sizeKey] ? { size_id: SIZE_MAP[sizeKey] } : {}),
        attributes,
        photos: Array.isArray(photos)
          ? photos.map((photo, index) => ({
              remote_url: photo?.url || photo?.remote_url || photo,
              order: index + 1,
            }))
          : [],
      });

      const signature = signVintedRequest({
        secret: VINTED_PRO_SECRET_KEY,
        method: 'POST',
        path: endpointUrl.pathname,
        timestamp,
        body,
      });

      const response = await fetch(endpointUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': VINTED_PRO_ACCESS_KEY,
          'X-Signature': signature,
          'X-Timestamp': timestamp,
        },
        body,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return res.status(response.status).json({
          error: 'vinted_pro_error',
          details: data,
        });
      }

      return res.status(201).json({
        ok: true,
        listing: data,
      });
    } catch (err) {
      console.error('[pro/vinted/listings]', err);
      return res.status(500).json({ error: 'server_error' });
    }
  });
} else {
  router.post('/vinted/listings', requireAuth, (_req, res) => {
    return res.status(501).json({
      error: 'vinted_pro_disabled',
      message:
        'Configure VINTED_PRO_ACCESS_KEY / SECRET_KEY / ACCOUNT_ID to activer le mode PRO.',
    });
  });
}

router.post('/lbc/listings', requireAuth, (_req, res) => {
  return res.status(501).json({
    error: 'lbc_pro_unavailable',
    message:
      'Hook placeholder — demande l’accès API Pro auprès de Leboncoin et implémente la requête ici.',
  });
});

module.exports = router;
