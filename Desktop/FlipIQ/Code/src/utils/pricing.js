// backend/src/utils/pricing.js
let fetchFn = globalThis.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}
const fetch = (...a) => fetchFn(...a);

const SERPAPI_KEY = process.env.SERPAPI_KEY;

function toNumber(x) {
  if (typeof x === 'number') return x;
  if (!x) return null;
  const m = String(x).replace(/[^\d.,]/g, '').replace(',', '.').match(/[\d.]+/g);
  if (!m) return null;
  const n = parseFloat(m.join(''));
  return Number.isFinite(n) ? n : null;
}

function median(nums) {
  const a = nums.slice().sort((x, y) => x - y);
  const n = a.length;
  if (!n) return null;
  const mid = Math.floor(n / 2);
  return n % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * Estime un prix médian via SerpAPI (Google Shopping).
 * @param {string} query
 * @param {{hl?:string, gl?:string, location?:string}} opts
 * @returns {Promise<{median:number|null, currency:string}>}
 */
async function estimateMedianPrice(query, opts = {}) {
  if (!SERPAPI_KEY) {
    return { median: null, currency: 'EUR' };
  }
  const hl = opts.hl || 'fr';
  const gl = opts.gl || 'fr';
  const location = opts.location || 'France';

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', query);
  url.searchParams.set('hl', hl);
  url.searchParams.set('gl', gl);
  url.searchParams.set('location', location);
  url.searchParams.set('api_key', SERPAPI_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`[serpapi] HTTP ${res.status} — ${t.slice(0, 300)}`);
  }
  const data = await res.json();

  const items = data?.shopping_results || [];
  const prices = [];
  let currency = 'EUR';

  for (const it of items) {
    // SerpAPI expose parfois extracted_price / currency
    if (typeof it.extracted_price === 'number') {
      prices.push(it.extracted_price);
      if (it.currency) currency = it.currency;
      continue;
    }
    // sinon parser "price"
    const p = toNumber(it.price);
    if (p != null) {
      prices.push(p);
      if (it.currency) currency = it.currency;
    }
  }

  return { median: median(prices), currency };
}

module.exports = { estimateMedianPrice };
