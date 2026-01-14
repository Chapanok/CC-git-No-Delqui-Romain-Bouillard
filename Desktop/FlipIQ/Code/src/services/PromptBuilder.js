// /backend/services/promptBuilder.js
'use strict';

/**
 * Prompts for marketplace-quality copy that reads like a real person.
 * Returns messages for Chat Completions and keeps everything language/platform aware.
 */

function humanizeKey(key) {
  return String(key || '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function normalizeLang(lang) {
  const L = String(lang || 'en').toLowerCase();
  if (L.startsWith('fr')) return 'fr';
  return 'en';
}

function platformStyle(platform = 'generic', lang = 'en') {
  const isFR = normalizeLang(lang) === 'fr';
  const p = String(platform || 'generic').toLowerCase();

  // Very lightweight “tone presets” inspired by Vinted / Leboncoin / eBay
  if (p.includes('vinted')) {
    return isFR
      ? 'Ton amical et honnête, phrases courtes, pas de pub, pas d’emojis, on reste factuel.'
      : 'Friendly, honest tone. Short sentences, no hype, no emojis.';
  }
  if (p.includes('leboncoin') || p.includes('lbc')) {
    return isFR
      ? 'Annonce simple et directe. Aucune exagération. Pas de superlatifs. Style conversationnel.'
      : 'Simple, direct listing. No fluff. Conversational style.';
  }
  if (p.includes('ebay')) {
    return isFR
      ? 'Style clair et précis. Détails utiles pour l’acheteur. Pas de blabla.'
      : 'Clear, precise style. Practical buyer details. No fluff.';
  }
  // Generic
  return isFR
    ? 'Ton naturel et authentique, comme un particulier. Phrases courtes, sans publicité.'
    : 'Natural, authentic tone like a private seller. Short sentences, no marketing speak.';
}

function exemplar(lang = 'en') {
  const isFR = normalizeLang(lang) === 'fr';
  return isFR
    ? `Exemple de ton :
"Je vends mon iPhone 15 Pro, utilisé environ 8 mois. Modèle 256 Go, couleur Noir sidéral. Toujours protégé avec coque et verre trempé. Tout fonctionne nickel, batterie à ~96%. Je passe au modèle suivant.
Vendu avec la boîte et le câble USB-C. Remise en main propre possible à Lyon ou envoi si vous prenez les frais."`
    : `Example tone:
"Selling my iPhone 15 Pro that I’ve used for about 8 months. 256GB in Space Black. Always in a case with a screen protector. Everything works perfectly, battery health ~96%. I’m only selling because I upgraded.
Includes original box and USB-C cable. Can meet in central London or ship if you cover postage."`;
}

function kvLines(specs = []) {
  return (specs || [])
    .map((s) => `- ${s.label}: ${s.value}`)
    .join('\n');
}

/** Turn questionnaire answers into readable key specs */
function extractKeySpecs(answers = {}) {
  const labelMap = {
    model: 'Model',
    brand: 'Brand',
    storage: 'Storage',
    memory: 'Memory',
    ram: 'RAM',
    size: 'Size',
    color: 'Color',
    condition: 'Condition',
    carrier: 'Carrier',
    unlocked: 'Lock Status',
    processor: 'Processor',
    gpu: 'Graphics',
    screen_size: 'Screen Size',
    resolution: 'Resolution',
    capacity: 'Capacity',
    accessories: 'Includes',
    version: 'Version',
    edition: 'Edition',
    // optional/common
    includes: 'Includes',
    box: 'Box',
    charger: 'Charger',
    controllers: 'Controllers',
    age: 'Owned For',
    purchase_date: 'Purchase Date',
    battery_health: 'Battery Health',
    defects: 'Issues',
  };
  const out = [];
  for (const [key, value] of Object.entries(answers || {})) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    let displayValue = value;
    if (key === 'unlocked') displayValue = value === 'yes' || value === true ? 'Unlocked' : 'Carrier Locked';
    else if (typeof value === 'boolean') displayValue = value ? 'Yes' : 'No';
    else if (Array.isArray(value)) displayValue = value.join(', ');

    out.push({ key, label: labelMap[key] || humanizeKey(key), value: String(displayValue) });
  }
  return out;
}

/** -------- TITLE prompt (kept, lightly tuned) -------- */
function buildTitlePrompt(detectedObject, answers, categoryInfo, lang = 'en', platform = 'generic') {
  const L = normalizeLang(lang);
  const specs = extractKeySpecs(answers);
  const tone = platformStyle(platform, L);

  return `Generate a clear, specific marketplace listing title.
Language: ${L}
Platform style: ${tone}

Item: ${detectedObject}
Category: ${categoryInfo?.categoryName || 'General'}

Key details:
${kvLines(specs)}

Rules:
- Max 80 characters
- Include brand/model + the key selling spec (e.g., storage/edition/size)
- Natural product naming, no marketing words, no emojis
- Return ONLY the title text`;
}

/** -------- DESCRIPTION messages (STRONG Visual Analysis added) -------- */
function buildDescriptionMessages({
  detectedObject,
  answers = {},
  categoryInfo,
  lang = 'en',
  platform = 'generic',
  conditionType = 'used',
  usedGrade = null,
  currency = 'EUR',
  suggestedPrice = null,
}) {
  const L = normalizeLang(lang);
  const isFR = L === 'fr';
  const tone = platformStyle(platform, L);
  const specs = extractKeySpecs(answers);
  const system = [
    'You write second-hand marketplace listings that sound like real people.',
    'You are an expert visual inspector: analyze the provided image context deeply.',
    'No invented facts. Use only the details provided.',
    'Keep sentences short. Avoid hype and clichés.',
    'Never include contact info or external links.',
    `Write in: ${L}.`,
  ].join(' ');
  const user = [
    `${isFR ? 'Rédige une description naturelle pour une annonce.' : 'Write a natural marketplace description.'}`,
    '',
    `Platform style: ${tone}`,
    `Item: ${detectedObject}`,
    `Category: ${categoryInfo?.categoryName || 'General'}`,
    `Condition: ${conditionType}${usedGrade ? ` (${usedGrade})` : ''}`,
    suggestedPrice ? `${isFR ? 'Prix conseillé' : 'Suggested price'}: ${currency} ${suggestedPrice}` : '',
    '',
    `${isFR ? 'Caractéristiques' : 'Specifications'}:`,
    kvLines(specs),
    '',
    `--- CRITICAL INSTRUCTION: VISUAL CONDITION ---`,
    isFR
      ? `Analyse l'image pour détecter les défauts visibles (taches, trous, rayures, décoloration). 
         - Si tu vois un défaut : mentionne-le clairement.
         - Si l'article semble propre : écris explicitement "Aucune tache ni trou visible" ou "Pas de rayures visibles".`
      : `Analyze the image for visible flaws (stains, holes, scratches, fading, discoloration).
         - If you see a flaw: describe it clearly.
         - If clean: explicitly state "No visible marks or discoloration" or "No scratches".`,
    '',
    `${isFR ? 'Structure attendue' : 'Structure'}:`,
    isFR
      ? `1) Intro brève : ce que c'est et pourquoi je le vends
2) Détails (modèle, taille, etc.)
3) ÉTAT & DÉFAUTS : Soyez très précis sur l'aspect visuel (ex: "Légère usure sur le coin" ou "Aucun défaut visible")
4) Conclusion (dispo)`
      : `1) Short intro: what it is + reason for selling
2) Key details
3) CONDITION & FLAWS: Be specific about visual condition (e.g., "Slight wear on corner" or "No visible marks/fading")
4) Closing`,
    `${isFR ? 'Contraintes' : 'Constraints'}:`,
    `- ${isFR ? '3–4 courts paragraphes maximum' : 'Maximum 3–4 short paragraphs'}`,
    `- ${isFR ? '0 emoji' : '0 emojis'}`,
    `- ${isFR ? 'Renvoie un JSON strict' : 'Return STRICT JSON only'}`,
    '',
    'JSON shape:',
    `{
  "description_long": "string (include specific visual condition notes)",
  "description_short": "string (summary)"
}`,
    '',
    exemplar(L),
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/* -------- Template bullets + fallback description (no price in text) -------- */

function symbol(cur) {
  switch ((cur || '').toUpperCase()) {
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'USD':
    default:
      return '$';
  }
}
const isFR = (lang) => String(lang || 'en').toLowerCase().startsWith('fr');

function gradeScore({ conditionType = 'used', usedGrade = null, lang = 'en' }) {
  if (conditionType === 'new') return isFR(lang) ? '10/10 (neuf)' : '10/10 (new)';
  const g = String(usedGrade || '').toLowerCase();
  if (g === 'perfect') return isFR(lang) ? '9/10 (comme neuf)' : '9/10 (like new)';
  if (g === 'good') return isFR(lang) ? '7/10 (légères traces)' : '7/10 (light wear)';
  if (g === 'poor') return isFR(lang) ? '5/10 (usure visible)' : '5/10 (visible wear)';
  return isFR(lang) ? '7/10 (bon état)' : '7/10 (good condition)';
}

function pickCategory(categoryId = '', title = '', answers = {}) {
  const t = `${categoryId} ${title}`.toLowerCase();
  const has = (k) => t.includes(k);

  if (has('shoe') || has('sneaker') || has('sneakers') || answers.shoe_size) return 'shoes';
  if (has('cloth') || has('apparel') || has('tshirt') || has('jean') || has('hoodie') || has('dress')) return 'clothes';
  if (has('phone') || has('iphone') || has('galaxy') || has('pixel')) return 'phone';
  if (has('laptop') || has('notebook') || has('macbook')) return 'laptop';
  if (has('tablet') || has('ipad') || has('galaxy tab')) return 'tablet';
  if (has('console') || has('playstation') || has('ps5') || has('xbox') || has('switch')) return 'console';
  if (has('camera') || has('eos') || has('alpha') || has('lumix')) return 'camera';
  if (has('headphone') || has('earbud') || has('airpods') || has('buds')) return 'headphones';
  if (has('watch') || has('wear') || has('apple watch') || has('fitbit') || has('garmin')) return 'wearable';
  if (has('bag') || has('sac') || has('backpack')) return 'bag';
  if (has('monitor') || has('tv') || has('television')) return 'display';
  if (has('speaker') || has('soundbar') || has('audio')) return 'speaker';
  if (has('furniture') || has('desk') || has('table') || has('chair')) return 'furniture';
  if (has('bike') || has('scooter') || has('velo')) return 'bike';
  if (has('toy') || has('collectible') || has('figurine') || has('lego')) return 'collectible';
  return 'generic';
}

function val(...candidates) {
  for (const v of candidates) if (v != null && String(v).trim() !== '') return String(v).trim();
  return '';
}
function joinNonEmpty(arr, sep = ' / ') {
  return arr.filter(Boolean).join(sep);
}

function buildTemplateDescription({
  title,
  lang = 'en',
  currency = 'EUR', // kept for compatibility, not used in text
  recommendedPrice = null, // kept for compatibility, not used in text
  conditionType = 'used',
  usedGrade = null,
  categoryId = null,
  answers = {},
}) {
  const fr = isFR(lang);
  const line = (s) => String(s || '').trim();
  const score = gradeScore({ conditionType, usedGrade, lang });

  const brand = val(answers.brand);
  const model = val(answers.model, answers.version, answers.edition);
  const color = val(answers.color);
  const size = val(answers.size, answers.shoe_size, answers.screen_size);
  const storage = val(answers.storage, answers.capacity);
  const ram = val(answers.ram, answers.memory);
  const battery = val(answers.battery_health, answers.battery);
  const unlocked = answers.unlocked === true || answers.unlocked === 'yes';
  const includeTxt = (() => {
    const acc = answers.accessories;
    if (!acc) return '';
    if (Array.isArray(acc)) return acc.join(', ');
    return String(acc);
  })();
  const cat = pickCategory(categoryId, title, answers);

  const bullets = [];
  const recap = joinNonEmpty(
    [brand && model ? `${brand} ${model}` : title, storage, color],
    fr ? ' — ' : ' — '
  );
  if (recap) bullets.push(line(recap));

  switch (cat) {
    case 'clothes':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      bullets.push(fr ? 'Aucune tache, trou ou décoloration visible.' : 'No visible marks, holes, or color degrading.');
      if (size) bullets.push(fr ? `Taille : ${size}` : `Size: ${size}`);
      if (color) bullets.push(fr ? `Couleur : ${color}` : `Colour: ${color}`);
      bullets.push(fr ? 'Expédition rapide et soignée' : 'Fast, careful shipping');
      break;
    case 'shoes':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      bullets.push(fr ? 'Semelles et talons en bon état.' : 'Soles and heels in good condition.');
      if (size) bullets.push(fr ? `Pointure : ${size}` : `Size: ${size}`);
      if (color) bullets.push(fr ? `Couleur : ${color}` : `Colour: ${color}`);
      bullets.push(fr ? 'Envoi soigné / remise en main propre possible' : 'Careful shipping / local pickup OK');
      break;
    case 'phone':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      bullets.push(fr ? 'Écran et dos intacts (voir photos).' : 'Screen and back intact (see photos).');
      if (storage) bullets.push(fr ? `Stockage : ${storage}` : `Storage: ${storage}`);
      if (battery) bullets.push(fr ? `Batterie : ${battery}` : `Battery: ${battery}`);
      if (includeTxt) bullets.push(fr ? `Inclus : ${includeTxt}` : `Included: ${includeTxt}`);
      break;
    case 'laptop':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      if (ram || storage)
        bullets.push(fr ? `Mémoire/SSD : ${joinNonEmpty([ram, storage])}` : `RAM/SSD: ${joinNonEmpty([ram, storage])}`);
      if (size) bullets.push(fr ? `Écran : ${size}` : `Display: ${size}`);
      const cpu = val(answers.processor, answers.cpu);
      const gpu = val(answers.gpu, answers.graphics);
      if (cpu) bullets.push(fr ? `Processeur : ${cpu}` : `CPU: ${cpu}`);
      if (gpu) bullets.push(fr ? `Graphiques : ${gpu}` : `GPU: ${gpu}`);
      if (includeTxt) bullets.push(fr ? `Inclus : ${includeTxt}` : `Included: ${includeTxt}`);
      break;
    case 'tablet':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      if (storage) bullets.push(fr ? `Stockage : ${storage}` : `Storage: ${storage}`);
      if (size) bullets.push(fr ? `Écran : ${size}` : `Display: ${size}`);
      if (includeTxt) bullets.push(fr ? `Inclus : ${includeTxt}` : `Included: ${includeTxt}`);
      break;
    case 'console':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      const controllers = val(answers.controllers);
      if (storage) bullets.push(fr ? `Stockage : ${storage}` : `Storage: ${storage}`);
      if (controllers) bullets.push(fr ? `Manettes : ${controllers}` : `Controllers: ${controllers}`);
      if (includeTxt) bullets.push(fr ? `Inclus : ${includeTxt}` : `Included: ${includeTxt}`);
      break;
    case 'camera':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      const lens = val(answers.lens);
      const mp = val(answers.megapixels, answers.camera_mp);
      if (mp) bullets.push(fr ? `Capteur : ${mp}` : `Sensor: ${mp}`);
      if (lens) bullets.push(fr ? `Objectif : ${lens}` : `Lens: ${lens}`);
      if (includeTxt) bullets.push(fr ? `Inclus : ${includeTxt}` : `Included: ${includeTxt}`);
      break;
    case 'headphones':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      const anc = answers.noise_cancelling === true || answers.anc === true;
      if (anc) bullets.push(fr ? 'Réduction de bruit' : 'Noise cancelling');
      if (battery) bullets.push(fr ? `Autonomie : ${battery}` : `Battery: ${battery}`);
      if (includeTxt) bullets.push(fr ? `Inclus : ${includeTxt}` : `Included: ${includeTxt}`);
      break;
    case 'wearable':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      if (size) bullets.push(fr ? `Taille boîtier : ${size}` : `Case size: ${size}`);
      if (color) bullets.push(fr ? `Couleur : ${color}` : `Colour: ${color}`);
      if (battery) bullets.push(fr ? `Batterie : ${battery}` : `Battery: ${battery}`);
      break;
    case 'bag':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      bullets.push(fr ? 'Aucun accroc ni tache.' : 'No visible marks or tears.');
      if (size) bullets.push(fr ? `Dimensions : ${size}` : `Size: ${size}`);
      const material = val(answers.material);
      if (material) bullets.push(fr ? `Matière : ${material}` : `Material: ${material}`);
      if (color) bullets.push(fr ? `Couleur : ${color}` : `Colour: ${color}`);
      break;
    case 'display':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      const res = val(answers.resolution);
      const hz = val(answers.refresh_rate, answers.hz);
      if (size) bullets.push(fr ? `Taille : ${size}` : `Size: ${size}`);
      if (res) bullets.push(fr ? `Résolution : ${res}` : `Resolution: ${res}`);
      if (hz) bullets.push(fr ? `Fréquence : ${hz}` : `Refresh: ${hz}`);
      break;
    case 'speaker':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      const watts = val(answers.power, answers.watt, answers.watts);
      if (watts) bullets.push(fr ? `Puissance : ${watts}` : `Power: ${watts}`);
      const conn = val(answers.connections, answers.connectivity);
      if (conn) bullets.push(fr ? `Connexions : ${conn}` : `Connections: ${conn}`);
      break;
    case 'furniture':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      if (size) bullets.push(fr ? `Dimensions : ${size}` : `Size: ${size}`);
      const wood = val(answers.material);
      if (wood) bullets.push(fr ? `Matière : ${wood}` : `Material: ${wood}`);
      bullets.push(fr ? 'Retrait sur place privilégié' : 'Prefer local pickup');
      break;
    case 'bike':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      const frame = val(answers.frame_size);
      const wheels = val(answers.wheel_size);
      const range = val(answers.range);
      if (frame) bullets.push(fr ? `Taille cadre : ${frame}` : `Frame size: ${frame}`);
      if (wheels) bullets.push(fr ? `Roues : ${wheels}` : `Wheels: ${wheels}`);
      if (range) bullets.push(fr ? `Autonomie : ${range}` : `Range: ${range}`);
      break;
    case 'collectible':
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      const sealed = answers.sealed === true;
      if (sealed) bullets.push(fr ? 'Scellé' : 'Sealed');
      if (includeTxt) bullets.push(fr ? `Complet : ${includeTxt}` : `Complete: ${includeTxt}`);
      break;
    default:
      if (score) bullets.push(fr ? `État : ${score}` : `Condition: ${score}`);
      if (includeTxt) bullets.push(fr ? `Inclus : ${includeTxt}` : `Included: ${includeTxt}`);
      bullets.push(fr ? 'Envoi rapide' : 'Fast shipping');
      break;
  }

  const description_long = bullets.filter(Boolean).join('\n\n');
  const description_short = bullets[0] || title || '';
  return { description_long, description_short };
}

function sentence(s) {
  const t = String(s || '').trim();
  if (!t) return '';
  return /[.!?…]$/.test(t) ? t : `${t}.`;
}
function conditionLabel({ conditionType = 'used', usedGrade = null, lang = 'en' }) {
  const fr = isFR(lang);
  if (conditionType === 'new') return fr ? 'Neuf' : 'New';
  const grade = usedGrade ? String(usedGrade).toLowerCase() : '';
  if (!grade) return fr ? 'Occasion' : 'Used';
  const up = grade.charAt(0).toUpperCase() + grade.slice(1);
  return fr ? `Occasion — ${grade}` : `Used — ${up}`;
}
function extractDetailsFromAnswers(answers = {}, lang = 'en') {
  const fr = isFR(lang);
  const d = { why: '', age: '', key: '', issues: '', includes: '', meet: '' };
  const brand = answers.brand || '';
  const model = answers.model || answers.version || answers.edition || '';
  const storage = answers.storage || answers.capacity || '';
  const color = answers.color || '';
  const size = answers.size || answers.screen_size || '';
  const mem = answers.memory || answers.ram || '';
  const unlocked = answers.unlocked === 'yes' || answers.unlocked === true ? (fr ? 'désimlocké' : 'unlocked') : '';
  const battery = answers.battery_health || answers.battery || '';
  const parts = [
    brand && model ? `${brand} ${model}` : '',
    storage,
    mem,
    color,
    size,
    unlocked,
    battery ? (fr ? `batterie ${battery}` : `battery ${battery}`) : '',
  ].filter(Boolean);

  if (parts.length) d.key = parts.join(' • ');
  if (answers.why_selling) d.why = answers.why_selling;
  if (answers.age) d.age = answers.age;
  if (answers.issues) d.issues = answers.issues;
  if (answers.accessories) {
    d.includes = Array.isArray(answers.accessories) ? answers.accessories.join(', ') : String(answers.accessories);
  }
  d.meet = fr
    ? 'Remise en main propre possible, envoi ok si frais pris en charge.'
    : 'Can meet locally, happy to ship if you cover postage.';
  return d;
}

function buildHumanFallbackDescription({
  title,
  lang = 'en',
  currency = 'EUR', // compatibility
  recommendedPrice = null, // compatibility
  conditionType = 'used',
  usedGrade = null,
  categoryId = null,
  answers = {},
}) {
  const tl = String(title || '').trim();
  const condText = conditionLabel({ conditionType, usedGrade, lang });
  const details = extractDetailsFromAnswers(answers, lang);
  const description_long = isFR(lang)
    ? [sentence(`Je vends mon/ma ${tl}`), sentence(details.key), sentence(`État : ${condText}`), sentence(details.meet)]
        .filter(Boolean)
        .join('\n\n')
    : [sentence(`Selling my ${tl}`), sentence(details.key), sentence(`Condition: ${condText}`), sentence(details.meet)]
        .filter(Boolean)
        .join('\n\n');
  const description_short = `${tl} — ${condText}`;
  return { description_long, description_short };
}

/** Exports: used by both site + app so prompts stay identical */
module.exports = {
  buildTitlePrompt,
  buildDescriptionMessages,
  buildTemplateDescription,
  buildHumanFallbackDescription,
  extractKeySpecs,
  humanizeKey,
};