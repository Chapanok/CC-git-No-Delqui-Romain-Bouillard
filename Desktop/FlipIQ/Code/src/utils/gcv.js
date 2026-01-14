// backend/src/utils/gcv.js
const path = require('path');
const fs = require('fs');

let gcvClient = null;

function getVisionClient() {
  if (gcvClient) return gcvClient;

  // Deux modes d'auth:
  // 1) GOOGLE_APPLICATION_CREDENTIALS => chemin vers le JSON
  // 2) GOOGLE_CLOUD_CREDENTIALS_JSON  => le JSON inline
  const hasKeyPath = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const hasInline  = !!process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;

  const vision = require('@google-cloud/vision');
  if (hasInline) {
    const creds = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS_JSON);
    gcvClient = new vision.ImageAnnotatorClient({ credentials: creds });
  } else {
    // va utiliser GOOGLE_APPLICATION_CREDENTIALS si défini, sinon ADC
    gcvClient = new vision.ImageAnnotatorClient();
  }
  return gcvClient;
}

/**
 * OCR multi-images locales avec Google Cloud Vision.
 * Concatène tous les textes trouvés.
 * @param {string[]} localPaths - chemins absolus des fichiers
 * @returns {Promise<{model:string, fullText:string, hasText:boolean}>}
 */
async function ocrLocalImages(localPaths = []) {
  const client = getVisionClient();
  let fullText = '';

  for (const p of localPaths) {
    try {
      const [result] = await client.textDetection(p);
      const txt = result?.fullTextAnnotation?.text || '';
      if (txt) fullText += (fullText ? '\n' : '') + txt;
    } catch (e) {
      console.warn('[gcv] OCR error on', p, e.message);
    }
  }
  const out = {
    model: 'google-vision-text-v1',
    fullText: fullText.trim(),
    hasText: !!fullText.trim()
  };
  return out;
}

module.exports = {
  ocrLocalImages,
};
