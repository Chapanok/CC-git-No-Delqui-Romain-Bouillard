// backend/src/utils/serpapi.js
const { URLSearchParams } = require('url');
const { fetchWithRetry } = require('./fetch-retry'); // 💡 Import

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const LENS_LANG = process.env.LENS_LANG || 'fr';
const LENS_COUNTRY = process.env.LENS_COUNTRY || 'fr';

// ... (Helpers parseNumberFromPrice et median inchangés) ...
function parseNumberFromPrice(str) {
  if (!str) return null;
  const clean = str.replace(/\s/g, '').replace(',', '.');
  const m = clean.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function median(nums) {
  const arr = nums.slice().sort((a,b)=>a-b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

async function lensIdentify(imageUrl, { lang=LENS_LANG, country=LENS_COUNTRY } = {}) {
  if (!SERPAPI_KEY) throw new Error('SERPAPI_KEY manquant');
  if (!imageUrl) throw new Error('imageUrl requis');

  const qs = new URLSearchParams({
    engine: 'google_lens',
    url: imageUrl,
    api_key: SERPAPI_KEY,
    hl: lang,
    gl: country
  });

  // 💡 Stabilité: Timeout 15s
  const resp = await fetchWithRetry(`https://serpapi.com/search.json?${qs.toString()}`, {
      timeout: 15000
  });
  
  if (!resp.ok) throw new Error(`Lens HTTP ${resp.status}`);
  const data = await resp.json();
  // ... (Reste de la logique inchangé)
  const titles = [];
  if (Array.isArray(data.visual_matches)) {
    for (const v of data.visual_matches) if (v?.title) titles.push(v.title);
  }
  if (data.best_guess?.label) titles.unshift(data.best_guess.label);
  const unique = [...new Set(titles.map(t => t.trim()))].filter(Boolean);
  return { titles: unique.slice(0, 10), raw: data };
}

async function shoppingMedian(query, { lang=LENS_LANG, country=LENS_COUNTRY } = {}) {
  if (!SERPAPI_KEY) throw new Error('SERPAPI_KEY manquant');
  if (!query) throw new Error('query requis');

  const qs = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    api_key: SERPAPI_KEY,
    hl: lang,
    gl: country,
    num: '50'
  });

  // 💡 Stabilité: Timeout 15s
  const resp = await fetchWithRetry(`https://serpapi.com/search.json?${qs.toString()}`, {
      timeout: 15000
  });

  if (!resp.ok) throw new Error(`Shopping HTTP ${resp.status}`);
  const data = await resp.json();
  // ... (Reste de la logique inchangé)
  const items = data.shopping_results || data.product_results || [];
  const values = [];
  const samples = [];
  for (const it of items) {
    const label = it.price || it.extracted_price || it.extracted_price_base || it.secondary_price;
    const amount = typeof it.extracted_price === 'number'
      ? it.extracted_price
      : parseNumberFromPrice(label || '');
    if (amount) {
      values.push(amount);
      samples.push({ title: it.title, source: it.source, price: label || `${amount}`, link: it.link });
    }
  }
  const med = median(values);
  const currency =
    (items.find(i => (i.price || '').includes('€')) && 'EUR') ||
    (items.find(i => (i.price || '').includes('$')) && 'USD') ||
    (items.find(i => (i.price || '').includes('£')) && 'GBP') || null;
  return { median: med || null, currency, count: values.length, samples: samples.slice(0, 8), raw: data };
}

module.exports = { lensIdentify, shoppingMedian };