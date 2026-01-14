// backend/src/utils/openai.js
'use strict';

const fs = require('fs');

// --- CORRECTION ROBUSTE ---
// On essaie de charger PromptBuilder avec ou sans majuscule pour éviter l'erreur
let PromptBuilder;
try {
  PromptBuilder = require('../services/PromptBuilder');
} catch (e) {
  try {
    PromptBuilder = require('../services/promptBuilder');
  } catch (e2) {
    console.error("🔥 ERREUR FATALE : Impossible de trouver le fichier PromptBuilder.js (ou promptBuilder.js) dans /backend/services/");
    throw e2; // Cela fera crasher le serveur proprement pour que tu voies l'erreur
  }
}

// fetch (Node / polyfill)
let fetchFn = globalThis.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}
const fetch = (...a) => fetchFn(...a);

const OPENAI_API_KEY       = process.env.OPENAI_API_KEY;
const OPENAI_MODEL         = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_VISION_MODEL  = process.env.OPENAI_VISION_MODEL || OPENAI_MODEL;

/* ----------------- helpers ----------------- */
function b64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

async function _postJSON(url, body) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquant');
  const resp = await fetch(url, {
    method:'POST',
    headers:{
      'Authorization':`Bearer ${OPENAI_API_KEY}`,
      'Content-Type':'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const t = await resp.text().catch(()=> '');
    throw new Error(`OpenAI HTTP ${resp.status} ${t.slice(0,200)}`);
  }
  return resp.json();
}

function pickText(r){
  if (typeof r.output_text === 'string') return r.output_text.trim();
  if (Array.isArray(r.choices) && r.choices[0]?.message?.content) return r.choices[0].message.content.trim();
  const c = r.output?.[0]?.content?.[0]?.text || r.content?.[0]?.text;
  return typeof c === 'string' ? c.trim() : '';
}

/* ----------------- Vision: libellé court ----------------- */
async function visionShortLabelFR(filePath){
  const img = `data:image/jpeg;base64,${b64(filePath)}`;
  const prompt = 'Libellé court FR (≤5 mots) décrivant précisément cet objet. Pas de marketplace.';
  try{
    const r = await _postJSON('https://api.openai.com/v1/responses', {
      model: OPENAI_MODEL,
      input: [{
        role:'user',
        content:[
          { type:'input_text', text: prompt },
          { type:'input_image', image_url: img }
        ]
      }],
      temperature: 0.1
    });
    const text = pickText(r);
    if (text) return text;
  }catch{}
  return '';
}

/* ----------------- Vision: couleur principale (FR) ----------------- */
const ALLOWED_COLORS = ['Noir','Blanc','Bleu','Violet','Rouge','Rose','Jaune','Vert','Argent','Gris','Or','Titane'];

async function visionColorFR(filePath){
  const img = `data:image/jpeg;base64,${b64(filePath)}`;
  const prompt = `Donne UNIQUEMENT la couleur principale en français dans cette liste: ${ALLOWED_COLORS.join(', ')}. Réponds par un seul mot.`;
  try{
    const r = await _postJSON('https://api.openai.com/v1/responses', {
      model: OPENAI_MODEL,
      input: [{
        role:'user',
        content:[
          { type:'input_text', text: prompt },
          { type:'input_image', image_url: img }
        ]
      }],
      temperature: 0.0
    });
    const text = pickText(r).trim();
    if (ALLOWED_COLORS.includes(text)) return text;
  }catch{}
  return null;
}

/* ----------------- Rédaction d'annonce (VIA PROMPT BUILDER) ----------------- */
async function writeListingFR({
  title,
  median,
  currency,
  condition,
  options = {},
  color,
  specs,
  lang = 'fr',
  hints = null
}) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquant');

  // 1) Préparation des données pour PromptBuilder
  const answers = {
    ...specs,
    color: color,
    condition: condition,
    ...options
  };

  // 2) Génération des messages via PromptBuilder
  // Vérification de sécurité
  if (!PromptBuilder || typeof PromptBuilder.buildDescriptionMessages !== 'function') {
      console.error("ERREUR CRITIQUE: PromptBuilder mal chargé.");
      throw new Error("Erreur interne: PromptBuilder missing");
  }

  const messages = PromptBuilder.buildDescriptionMessages({
    detectedObject: title || 'Article',
    answers: answers,
    categoryInfo: { categoryName: 'General' },
    lang: lang,
    conditionType: condition,
    currency: currency,
    suggestedPrice: median
  });

  // 3) Appel OpenAI (Chat Completion)
  try {
    const r = await _postJSON('https://api.openai.com/v1/chat/completions', {
      model: OPENAI_MODEL,
      messages: messages,
      temperature: 0.5,
      response_format: { type: "json_object" } 
    });

    const content = pickText(r);
    
    if (content && typeof content === 'string') {
      try {
        const parsed = JSON.parse(content);
        if (parsed.description_long) return parsed.description_long;
      } catch (e) {
        console.warn('Erreur parsing JSON OpenAI, retour brut:', e);
        return content;
      }
    }
  } catch (e) {
    console.error('Erreur génération description:', e);
  }

  // 4) Fallback manuel
  return PromptBuilder.buildHumanFallbackDescription({
    title,
    lang,
    currency,
    conditionType: condition,
    answers
  }).description_long;
}


/* ----------------- Vision: détection prioritaire via URL ----------------- */
async function visionDetectFRFromUrl(imageUrl, opts = {}) {
  const {
    model: visionModel = OPENAI_VISION_MODEL,
    temperature = 0.1,
  } = opts || {};

  if (!imageUrl) throw new Error('visionDetectFRFromUrl: imageUrl manquant');
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY manquant');

  const system = [
    'Tu es un extracteur francophone STRICT. Réponds UNIQUEMENT avec un JSON valide (minifié).',
    'Schéma de sortie obligatoire:',
    '{"label":string|null,"brand":string|null,"model":string|null,"color":string|null,"attributes":string[],"confidence":number,"ocr_full_text":string}',
    'Règles:',
    '- Si incertain, mets confidence<0.6 et certains champs à null.',
    '- Fournis toujours ocr_full_text (chaîne vide si rien lu).',
    '- Pas de texte hors JSON.'
  ].join('\n');

  const user = [
    'Analyse cette image de produit et extrais un label humain court en FR (ex: "iPhone 13 128 Go Noir").',
    'Tente de déduire marque/modèle/couleur si visibles/probables.',
    'Lis tout texte utile (OCR) tel quel (ne reformule pas).',
    `URL: ${imageUrl}`
  ].join('\n');

  const body = {
    model: visionModel,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user',   content: [
          { type: 'input_text', text: user },
          { type: 'input_image', image_url: imageUrl }
      ] }
    ],
    temperature
  };

  const out = await _postJSON('https://api.openai.com/v1/responses', body);
  const raw =
    out.output_text
    || out.content?.[0]?.text
    || out.choices?.[0]?.message?.content
    || '';

  // extrait le 1er JSON
  const m = String(raw).match(/\{[\s\S]*\}/);
  let parsed = null;
  try {
    parsed = JSON.parse(m ? m[0] : raw);
  } catch {
    return {
      label: null, brand: null, model: null, color: null,
      attributes: [], confidence: 0, ocr_full_text: ''
    };
  }

  const label = parsed.label ?? null;
  const brand = parsed.brand ?? null;
  const detectedModel = parsed.model ?? null;
  const color = parsed.color ?? null;
  const attributes = Array.isArray(parsed.attributes) ? parsed.attributes.slice(0,10) : [];
  const confidence = (typeof parsed.confidence === 'number') ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
  const ocr_full_text = (parsed.ocr_full_text && typeof parsed.ocr_full_text === 'string') ? parsed.ocr_full_text : '';

  return { label, brand, model: detectedModel, color, attributes, confidence, ocr_full_text };
}

module.exports = {
  visionShortLabelFR,
  visionColorFR,
  writeListingFR,
  visionDetectFRFromUrl
};