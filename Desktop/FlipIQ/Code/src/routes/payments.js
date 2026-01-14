// src/routes/payments.js
const express = require('express');
const router = express.Router();
const User = require('../models/user');
let requireAuth = require('../middleware/auth');
if (requireAuth && requireAuth.requireAuth) requireAuth = requireAuth.requireAuth;

let fetchFn = globalThis.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}
const fetch = (...args) => fetchFn(...args);

// ===== ENV / CONFIG =====
const env = process.env;
const NODE_ENV = env.NODE_ENV || 'development';
const DEFAULT_FRONT_BASE_URL = NODE_ENV === 'production'
  ? 'https://flipiqapp.com'
  : 'http://localhost/Site';
const DEFAULT_BACK_BASE_URL = NODE_ENV === 'production'
  ? 'https://k7675gz8.up.railway.app'
  : 'http://localhost:5000';

const FRONT_BASE_URL = (env.FRONT_BASE_URL || DEFAULT_FRONT_BASE_URL).replace(/\/$/, '');
const BACK_BASE_URL  = (env.BACK_BASE_URL  || DEFAULT_BACK_BASE_URL).replace(/\/$/, '');

const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO,
  STRIPE_PRICE_PREMIUM,
  PAYPAL_ENV = 'sandbox',
  PAYPAL_CLIENT_ID,
  PAYPAL_SECRET,
  PAYSAFECARD_ENV = 'TEST',
  PAYSAFECARD_API_KEY,
  PAYSAFECARD_CURRENCY = 'EUR',
} = env;

const PLAN_MAP = {
  pro: {
    name: 'Pro',
    stripePrice: STRIPE_PRICE_PRO,
    paypalAmount: '9.99',
    pscAmount: '9.99',
  },
  premium: {
    name: 'Premium',
    stripePrice: STRIPE_PRICE_PREMIUM,
    paypalAmount: '19.99',
    pscAmount: '19.99',
  },
};

// ===== Helpers =====
function successUrl(plan) { return `${FRONT_BASE_URL}/premium-return.php?status=success&plan=${encodeURIComponent(plan)}`; }
function cancelUrl(plan)  { return `${FRONT_BASE_URL}/premium-return.php?status=cancel&plan=${encodeURIComponent(plan)}`; }

async function activatePlan(userId, planId) {
  await User.updateOne(
    { _id: userId },
    { $set: { plan: planId, isPremium: ['pro','premium'].includes(planId) } }
  );
}

// ===== Stripe Handler (Extrait pour export) =====
// 💡 CORRECTION ICI : On crée une fonction nommée pour l'exporter
async function stripeWebhookHandler(req, res) {
  try {
    const sig = req.headers['stripe-signature'];
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    
    // req.body est ici un Buffer (grâce au middleware express.raw dans app.js)
    let event;

    if (STRIPE_WEBHOOK_SECRET) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      } catch (err) {
        console.error(`⚠️  Webhook Signature Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      // Fallback sans signature (déconseillé en prod mais utile en test local sans CLI)
      event = JSON.parse(req.body.toString());
    }

    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const userId = s.client_reference_id;
      const plan = s.metadata?.plan;
      if (userId && PLAN_MAP[plan]) await activatePlan(userId, plan);
    }
    return res.json({ received: true });
  } catch (e) {
    console.error('[stripe/webhook]', e);
    return res.status(400).send('Webhook error');
  }
}

// ===== Autres Providers (PayPal, PSC) =====
async function stripeCheckout({ plan, userId, userEmail }) {
  if (!STRIPE_SECRET_KEY) throw new Error('stripe_not_configured');
  const stripe = require('stripe')(STRIPE_SECRET_KEY);
  const priceId = PLAN_MAP[plan]?.stripePrice;
  if (!priceId) throw new Error('invalid_plan');
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: String(userId),
    customer_email: userEmail || undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl(plan),
    cancel_url: cancelUrl(plan),
    metadata: { plan },
  });
  return { url: session.url };
}

function paypalBaseUrl() {
  return PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function paypalAccessToken() {
    // Code existant inchangé pour PayPal...
    const basic = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    const r2 = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials'
    });
    if (!r2.ok) throw new Error('paypal_token_error');
    const data = await r2.json();
    return data.access_token;
}

async function paypalCreateOrder({ plan, userId }) {
  const amount = PLAN_MAP[plan]?.paypalAmount;
  if (!amount) throw new Error('invalid_plan');
  const token = await paypalAccessToken();
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      amount: { currency_code: 'EUR', value: amount },
      custom_id: String(userId) + ':' + plan
    }],
    application_context: {
      brand_name: 'FlipIQ',
      landing_page: 'LOGIN',
      user_action: 'PAY_NOW',
      return_url: `${BACK_BASE_URL}/api/payments/paypal/capture`,
      cancel_url: cancelUrl(plan)
    }
  };
  const r = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error('paypal_create_error');
  return { approve_url: (data.links || []).find(l => l.rel === 'approve')?.href };
}

async function paypalCaptureOrder(orderId) {
  const token = await paypalAccessToken();
  const r = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  const data = await r.json();
  if (!r.ok) throw new Error('paypal_capture_error');
  return data;
}

// PSC
function pscBaseUrl() {
  return PAYSAFECARD_ENV === 'PRODUCTION' ? 'https://api.paysafecard.com/v1' : 'https://apitest.paysafecard.com/v1';
}
async function pscCreate({ plan, userId }) {
  if (!PAYSAFECARD_API_KEY) throw new Error('paysafecard_not_configured');
  const amount = PLAN_MAP[plan]?.pscAmount;
  const body = {
    type: 'PAYSAFECARD',
    amount: { currency: PAYSAFECARD_CURRENCY, value: Number(amount) },
    redirect: { success_url: successUrl(plan), failure_url: cancelUrl(plan) },
    customer: { id: String(userId) },
    reporting_criteria: `${userId}:${plan}`
  };
  const r = await fetch(`${pscBaseUrl()}/payments`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${PAYSAFECARD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!r.ok) throw new Error('psc_create_error');
  return { auth_url: data?.redirect?.auth_url, id: data?.id };
}
async function pscDetails(id) {
  const r = await fetch(`${pscBaseUrl()}/payments/${id}`, {
    headers: { 'Authorization': `Bearer ${PAYSAFECARD_API_KEY}` }
  });
  const data = await r.json();
  if (!r.ok) throw new Error('psc_status_error');
  return data;
}

// ===== Routes du Router (On retire le webhook d'ici !) =====

router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { provider, plan } = req.body || {};
    if (!PLAN_MAP[plan]) return res.status(400).json({ error: 'invalid_plan' });

    if (provider === 'stripe') {
      const s = await stripeCheckout({ plan, userId: req.user.uid, userEmail: req.user.email });
      return res.json({ url: s.url });
    }
    if (provider === 'paypal') {
      const p = await paypalCreateOrder({ plan, userId: req.user.uid });
      return res.json({ url: p.approve_url });
    }
    if (provider === 'paysafecard') {
      const p = await pscCreate({ plan, userId: req.user.uid });
      return res.json({ url: p.auth_url, psc_payment_id: p.id });
    }
    return res.status(400).json({ error: 'invalid_provider' });
  } catch (e) {
    console.error('[payments/checkout]', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

router.get('/paypal/capture', async (req, res) => {
  try {
    const orderId = req.query.token;
    if (!orderId) return res.status(400).send('Missing token');
    const data = await paypalCaptureOrder(orderId);
    const custom = data?.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id || data?.purchase_units?.[0]?.custom_id;
    const [userId, plan] = (custom || '').split(':');
    if (userId && plan && PLAN_MAP[plan]) await activatePlan(userId, plan);
    return res.redirect(`${FRONT_BASE_URL}/premium-return.php?status=success&plan=${encodeURIComponent(plan||'')}`);
  } catch (e) {
    console.error('[paypal/capture]', e);
    return res.redirect(`${FRONT_BASE_URL}/premium-return.php?status=error`);
  }
});

// Note: La route POST /stripe/webhook a été supprimée d'ici 
// car elle est gérée directement dans src/app.js pour utiliser express.raw()

router.get('/psc/status', requireAuth, async (req, res) => {
  try {
    const { id, plan } = req.query || {};
    if (!id || !PLAN_MAP[plan]) return res.status(400).json({ error: 'missing_params' });
    const data = await pscDetails(id);
    if (data?.status === 'SUCCESS') {
      await activatePlan(req.user.uid, plan);
      return res.json({ ok: true, status: 'SUCCESS' });
    }
    return res.json({ ok: false, status: data?.status || 'PENDING' });
  } catch (e) {
    console.error('[psc/status]', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// 💡 CORRECTION CRITIQUE : L'ordre est important.
// On exporte d'abord le routeur par défaut.
module.exports = router;

// ENSUITE on attache le handler spécifique pour que `app.js` puisse le lire (paymentsRoutes.stripeWebhookHandler)
module.exports.stripeWebhookHandler = stripeWebhookHandler;