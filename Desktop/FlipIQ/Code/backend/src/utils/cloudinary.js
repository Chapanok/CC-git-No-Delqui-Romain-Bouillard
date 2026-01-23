// backend/src/utils/cloudinary.js
const fs = require('fs');
let fetchFn = globalThis.fetch;
if (typeof fetchFn !== 'function') {
  fetchFn = (...a) => import('node-fetch').then(({ default: f }) => f(...a));
}
const fetch = (...a) => fetchFn(...a);

const CLOUD_NAME    = process.env.CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET;
const FOLDER        = process.env.CLOUDINARY_FOLDER || 'flipiq/vision';

function missingVars() {
  const miss = [];
  if (!CLOUD_NAME) miss.push('CLOUDINARY_CLOUD_NAME');
  if (!UPLOAD_PRESET) miss.push('CLOUDINARY_UPLOAD_PRESET');
  return miss;
}

/**
 * Upload non signé vers Cloudinary:
 * - nécessite un "unsigned upload preset" côté Cloudinary
 * - retourne l'URL publique (secure_url)
 */
async function cloudinaryUnsignedUpload(filePath, filenameHint = '') {
  const miss = missingVars();
  if (miss.length) {
    throw new Error(`Cloudinary non configure (${miss.join(' / ')})`);
  }

  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf]); // laisse Cloudinary déduire le type
  const name = filenameHint?.replace(/\.[a-z0-9]+$/i, '') || 'upload';

  const form = new FormData();
  form.append('file', blob, name);
  form.append('upload_preset', UPLOAD_PRESET);
  if (FOLDER) form.append('folder', FOLDER);

  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const resp = await fetch(url, { method: 'POST', body: form });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Cloudinary HTTP ${resp.status} ${text}`);
  }
  const data = await resp.json();
  if (!data.secure_url) throw new Error('Cloudinary: secure_url manquant dans la reponse');

  return {
    url: data.secure_url,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    public_id: data.public_id
  };
}

module.exports = { cloudinaryUnsignedUpload };
