// backend/src/providers/gcv.js
'use strict';

const { fetchWithRetry } = require('../utils/fetch-retry'); // 💡 Remplacement axios
const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY || '';

/**
 * Appelle Google Cloud Vision (REST) pour extraire du texte (OCR).
 * Utilise maintenant fetchWithRetry pour la résilience.
 */
async function extractTextFromImage(imageUrl) {
  if (!GOOGLE_VISION_API_KEY) {
    return { text: [], fullText: '', error: 'GOOGLE_VISION_API_KEY missing' };
  }
  if (!imageUrl || typeof imageUrl !== 'string') {
    return { text: [], fullText: '', error: 'image_url_missing' };
  }

  try {
    const apiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`;
    const requestBody = {
      requests: [{
        image: { source: { imageUri: imageUrl } },
        features: [
          { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 5 },
          { type: 'TEXT_DETECTION', maxResults: 10 }
        ],
        imageContext: { languageHints: ['fr', 'en', 'de', 'es', 'it'] }
      }]
    };

    // 💡 Stabilité: Utilisation de fetchWithRetry (timeout 8s, 2 retries)
    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000 
    });

    if (!response.ok) {
      throw new Error(`GCV HTTP ${response.status}`);
    }

    const data = await response.json();
    const result = data?.responses?.[0];

    if (!result) return { text: [], fullText: '', error: 'no_response' };

    const fullFromFTA = result.fullTextAnnotation?.text || '';
    const textAnnotations = Array.isArray(result.textAnnotations) ? result.textAnnotations : [];
    const fullFromTA0 = textAnnotations[0]?.description || '';
    const fullText = String(fullFromFTA || fullFromTA0 || '').trim();
    const textBlocks = textAnnotations.slice(1).map(t => t?.description).filter(Boolean);

    return { text: textBlocks, fullText, raw: result };

  } catch (err) {
    const msg = err?.message || 'gcv_failed';
    console.error('[GCV] OCR error:', msg);
    return { text: [], fullText: '', error: String(msg) };
  }
}

function parseModelFromOCR(fullText = '', textBlocks = []) {
  // ... (Logique de parsing regex inchangée, copier-coller la fonction existante)
  const blocks = Array.isArray(textBlocks) ? textBlocks : [];
  const allText = `${fullText} ${blocks.join(' ')}`;
  // ... (Garder le reste du code regex identique au fichier original)
  // Pour gagner de la place dans la réponse, je ne répète pas toute la regex ici 
  // car elle ne change pas. Assurez-vous de garder la fonction parseModelFromOCR telle quelle.
  
  // (Je remets le return pour que le code soit valide si copié tel quel)
  const candidates = new Set();
  const generic = allText.match(/\b[A-Z0-9][A-Z0-9-]{5,20}\b/gi) || [];
  generic.forEach(x => candidates.add(String(x).trim()));
  const filtered = [...candidates]; 
  return filtered[0] || null; 
}

// Note: Dans votre fichier final, assurez-vous de remettre tout le corps de parseModelFromOCR
// tel qu'il était dans le source original .

module.exports = { extractTextFromImage, parseModelFromOCR };