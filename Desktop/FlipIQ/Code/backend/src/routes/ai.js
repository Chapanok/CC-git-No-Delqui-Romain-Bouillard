// backend/src/routes/ai.js
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const router = express.Router();

// Imports utilitaires
const openai = require('../utils/openai');
const gcv = require('../utils/gcv');
const serpapi = require('../utils/serpapi');
const cache = require('../utils/cache');

// Middlewares d'authentification et quotas
const { requireAuth } = require('../middleware/auth');
const { ensureQuota } = require('../middleware/ensureQuota');

// Config
const VISION_THRESHOLD = Number(process.env.OPENAI_VISION_THRESHOLD || 0.75);
const LENS_LANG = process.env.LENS_LANG || 'fr';
const LENS_COUNTRY = process.env.LENS_COUNTRY || 'fr';

// === Uploads (multer disque) ===
const uploadDir = path.join(process.cwd(), 'uploads', 'ai');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, base + ext);
  }
});

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => ALLOWED.has(file.mimetype)
    ? cb(null, true) : cb(new Error('Type image non supporté'))
});

// === Helpers ===
function toDataUrl(filePath, mime) {
  const b64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime || 'image/jpeg'};base64,${b64}`;
}

function getFileHash(filePath) {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('md5');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (e) {
    return null;
  }
}

function looksGeneric(label) {
  if (!label) return true;
  const s = String(label).toLowerCase().normalize('NFKD').replace(/\s+/g, ' ').trim();
  const bad = new Set([
    'écran', 'screen', 'moniteur', 'monitor', 'ordinateur', 'pc', 'laptop', 'portable',
    'chaussure', 'shoes', 't-shirt', 'pull', 'vêtement', 'vetement', 'veste', 'pantalon', 'sac',
    'objet', 'article', 'produit', 'appareil', 'device', 'noir', 'blanc', 'bleu', 'rouge', 'gris'
  ]);
  const words = s.split(' ');
  if (words.length <= 2 && words.some(w => bad.has(w))) return true;
  const hasModelish = /[A-Z]*\d[A-Z0-9-]{2,}/i.test(s);
  return !hasModelish && [...bad].some(w => s === w || s.endsWith(' ' + w));
}

function bestQueryFrom(id, ocrText) {
  if (id?.brand && id?.model) return `${id.brand} ${id.model}`;
  if (id?.label) return id.label;
  if (ocrText) {
    const line = String(ocrText).split(/\n+/).find(l => /[A-Za-z]\d|\d[A-Za-z]/.test(l));
    if (line) return String(line).trim().slice(0, 120);
  }
  return '';
}

// OpenAI Vision wrapper local
async function visionDetectFR(dataUrls, { ocrText = '', priorLabel = '' } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) throw new Error('OPENAI_API_KEY manquant');

  let fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    fetchFn = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
  }
  const fetch = (...a) => fetchFn(...a);

  const BRAND_HINT = [
    'Apple', 'Dell', 'HP', 'Lenovo', 'ASUS', 'Acer', 'MSI', 'LG', 'Samsung', 'BenQ', 'Philips', 'ViewSonic', 'Sony',
    'NVIDIA', 'AMD', 'Canon', 'Nikon', 'PlayStation', 'Xbox', 'Nintendo', 'Nike', 'Adidas', 'Puma', 'New Balance'
  ].join(', ');

  const system = `Tu es un extracteur francophone STRICT. Réponds UNIQUEMENT avec un JSON minifié.
Schéma: {"label":string|null,"brand":string|null,"model":string|null,"color":string|null,"category":string|null,"confidence":number}
Règles:
- Privilégie un label spécifique: brand + model + type.
- Déduis brand/model si probables.
- confidence [0..1].
- Pas de texte hors JSON.`;

  const hints = [
    priorLabel ? `Label précédent: ${priorLabel}` : null,
    ocrText ? `Indices OCR: ${String(ocrText).slice(0, 2000)}` : null,
    `Marques possibles: ${BRAND_HINT}`
  ].filter(Boolean).join('\n');

  const images = dataUrls.slice(0, 5).map(url => ({ type: 'image_url', image_url: { url } }));

  const messages = [
    { role: 'system', content: system },
    {
      role: 'user', content: [
        { type: 'text', text: `Identifie le produit et remplis le JSON.\n${hints}` },
        ...images
      ]
    }
  ];

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0, response_format: { type: 'json_object' } })
  });

  if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
  const j = await r.json();
  
  let out = {};
  try {
    out = JSON.parse(j?.choices?.[0]?.message?.content || '{}');
  } catch { }

  return {
    label: (out.label && String(out.label).trim()) || null,
    brand: out.brand ?? null,
    model: out.model ?? null,
    color: out.color ?? null,
    category: out.category ?? null,
    confidence: typeof out.confidence === 'number' ? Math.max(0, Math.min(1, out.confidence)) : 0
  };
}

// (debug ping)
router.get('/_ping', (_req, res) => res.json({ ok: true, route: '/api/ai' }));

// -------------------------------------
// POST /api/ai/scan
// Protégé: requireAuth + ensureQuota (consomme 1 génération)
// -------------------------------------
router.post('/scan', requireAuth, ensureQuota, upload.array('images', 5), async (req, res) => {
  const files = (req.files || []).map(f => ({
    path: f.path, name: f.filename, mimetype: f.mimetype, size: f.size
  }));
  if (!files.length) return res.status(400).json({ ok: false, error: 'aucune image' });

  try {
    // Cache Check
    const mainFileHash = getFileHash(files[0].path);
    const cacheKeyVis = mainFileHash ? cache.keyVision(mainFileHash) : null;
    let cachedResult = cacheKeyVis ? cache.get(cacheKeyVis) : null;

    if (cachedResult) {
      console.log(`[CACHE] Hit Vision pour ${mainFileHash}`);
      return res.json(cachedResult);
    }

    const dataUrls = files.map(f => toDataUrl(f.path, f.mimetype));

    // Pass 1: Vision
    let id = await visionDetectFR(dataUrls, { ocrText: '' });
    if (!id || typeof id !== 'object') id = {};

    // OCR + Pass 2 si nécessaire
    let ocr = { model: 'gcv-rest-v1', fullText: '', hasText: false };
    if ((typeof id.confidence !== 'number') || id.confidence < VISION_THRESHOLD || looksGeneric(id.label) || !id.brand) {
      try {
        const o = await gcv.extractTextFromImage(dataUrls[0]);
        if (o && typeof o.fullText === 'string') {
          ocr.fullText = o.fullText;
          ocr.hasText = !!o.fullText.trim();
          ocr.model = o.model || 'gcv-rest-v1';
        }
      } catch (_) { }

      try {
        const refined = await visionDetectFR(dataUrls, { ocrText: ocr.fullText || '', priorLabel: id.label || '' });
        if (refined && typeof refined === 'object') {
          const pick = refined.confidence > (id.confidence || 0) ||
            (looksGeneric(id.label) && !looksGeneric(refined.label)) ||
            (!id.brand && refined.brand);
          if (pick) id = refined;
        }
      } catch (_) { }
    }

    // Pricing
    const q = bestQueryFrom(id, ocr.fullText);
    let pricing = { median: null, currency: 'EUR', count: 0, samples: [] };

    if (q) {
      const cacheKeyPrice = cache.keyPrice(q);
      const cachedPrice = cache.get(cacheKeyPrice);

      if (cachedPrice) {
        pricing = cachedPrice;
      } else {
        try {
          const pr = await serpapi.shoppingMedian(q, { lang: LENS_LANG, country: LENS_COUNTRY });
          if (pr && typeof pr === 'object') {
            pricing.median = (typeof pr.median === 'number') ? pr.median : null;
            pricing.currency = pr.currency || 'EUR';
            pricing.count = pr.count || 0;
            pricing.samples = Array.isArray(pr.samples) ? pr.samples.slice(0, 10) : [];
            if (pricing.median) cache.set(cacheKeyPrice, pricing, 3600 * 24);
          }
        } catch (_) { }
      }
    }

    const finalResponse = {
      ok: true,
      identification: {
        label: id.label || null,
        brand: id.brand || null,
        model: id.model || null,
        category: id.category || null,
        color: id.color || null,
        attributes: Array.isArray(id.attributes) ? id.attributes.slice(0, 10) : [],
        confidence: typeof id.confidence === 'number' ? Math.max(0, Math.min(1, id.confidence)) : 0,
        lensTitles: []
      },
      ocr,
      pricing,
      cloudinary: null
    };

    if (cacheKeyVis && id.confidence > 0.5) {
      cache.set(cacheKeyVis, finalResponse, 3600);
    }

    res.json(finalResponse);

  } catch (err) {
    console.error('[ai/scan] error:', err);
    res.status(500).json({ ok: false, error: 'scan_failed', requestId: req.reqId });
  } finally {
    try {
      for (const f of files) fs.unlinkSync(f.path);
    } catch { }
  }
});

// -------------------------------------
// POST /api/ai/describe (Texte seul)
// Protégé: requireAuth + ensureQuota (consomme 1 génération)
// -------------------------------------
router.post('/describe', requireAuth, ensureQuota, express.json(), async (req, res) => {
  try {
    const {
      title = '', condition = 'bon état', options = {}, color = null,
      priceHint = null, currency = 'EUR', specs = null, lang = 'fr', hints = {}
    } = req.body || {};

    const safe = (s, n) => (s ? String(s).slice(0, n) : null);
    const safeHints = {
      label: safe(hints.label, 300),
      ocrModel: safe(hints.ocrModel, 200),
      ocrFullText: safe(hints.ocrFullText, 5000),
      lensTitles: Array.isArray(hints.lensTitles) ? hints.lensTitles.slice(0, 20).map(t => safe(t, 200)) : []
    };

    const rounded = (typeof priceHint === 'number' && isFinite(priceHint)) ? Math.round(priceHint) : null;

    const descriptionRaw = await openai.writeListingFR({
      title: String(title || '').slice(0, 160),
      median: rounded,
      currency,
      condition,
      options: {
        meetup: !!options?.meetup,
        recent: !!options?.recent,
        never_worn: !!options?.never_worn
      },
      color,
      specs,
      lang,
      hints: safeHints
    });

    const words = String(descriptionRaw || '').trim().split(/\s+/);
    const description = words.length <= 100 ? descriptionRaw.trim() : words.slice(0, 100).join(' ') + '…';
    return res.json({ ok: true, roundedPrice: rounded, description });

  } catch (err) {
    console.error('[ai/describe] error:', err);
    const b = req.body || {};
    const rounded = (typeof b.priceHint === 'number' && isFinite(b.priceHint)) ? Math.round(b.priceHint) : null;
    return res.json({ ok: true, roundedPrice: rounded, description: b.title || 'Article à vendre' });
  }
});

// -------------------------------------
// POST /api/ai/listing (Génération après Scan)
// Protégé: requireAuth + ensureQuota (consomme 1 génération)
// -------------------------------------
router.post('/listing', requireAuth, ensureQuota, express.json(), async (req, res) => {
    try {
      const {
        title = '', condition = 'bon état', options = {}, color = null,
        priceHint = null, currency = 'EUR', specs = null, lang = 'fr', hints = {},
        rawScan = null 
      } = req.body || {};
  
      // Indices pour l'IA
      const safe = (s, n) => (s ? String(s).slice(0, n) : null);
      const safeHints = {
        label: safe(hints.label, 300),
        ocrModel: safe(hints.ocrModel, 200),
        ocrFullText: safe(hints.ocrFullText, 5000),
        lensTitles: Array.isArray(hints.lensTitles) ? hints.lensTitles.slice(0, 20).map(t => safe(t, 200)) : []
      };
  
      // Enrichir avec le scan précédent
      if (rawScan && rawScan.identification) {
          safeHints.label = safeHints.label || rawScan.identification.label;
          if (rawScan.ocr && rawScan.ocr.fullText) safeHints.ocrFullText = safe(rawScan.ocr.fullText, 5000);
      }
  
      // --- CORRECTION PRIX ---
      // 1. On regarde si un prix est envoyé explicitement (priceHint)
      // 2. Sinon, on regarde si le scan précédent (rawScan) contenait un prix médian
      let priceToUse = priceHint;
      
      if ((priceToUse === null || priceToUse === undefined) && rawScan && rawScan.pricing) {
          priceToUse = rawScan.pricing.median;
      }

      const rounded = (typeof priceToUse === 'number' && isFinite(priceToUse)) ? 
          Math.round(priceToUse) : null;
  
      // Appel OpenAI
      const descriptionRaw = await openai.writeListingFR({
        title: String(title || '').slice(0, 160),
        median: rounded,
        currency,
        condition,
        options: {
          meetup: !!options?.meetup,
          recent: !!options?.recent,
          never_worn: !!options?.never_worn
        },
        color,
        specs,
        lang,
        hints: safeHints
      });
  
      const words = String(descriptionRaw || '').trim().split(/\s+/);
      const description = words.length <= 100 ? descriptionRaw.trim() : words.slice(0, 100).join(' ') + '…';
  
      return res.json({ 
          ok: true, 
          price: rounded, 
          currency: currency,
          description 
      });
  
    } catch (err) {
      console.error('[ai/listing] error:', err);
      // Fallback
      return res.json({ 
          ok: true, 
          price: req.body.priceHint || null, 
          description: req.body.title || 'Article à vendre' 
      });
    }
  });

module.exports = router;