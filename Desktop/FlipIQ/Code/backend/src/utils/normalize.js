// backend/src/utils/normalize.js
const SITE_WORDS = [
  'amazon','amazon.com','vinted','leboncoin','lbc','beebs','kiabi','back market','backmarket',
  'rakuten','cdiscount','fnac','darty','ebay','aliexpress','wish','priceminister',
  'carrefour','auchan','zara','zalando','la redoute','h&m','hm','go sport','decathlon',
];

const COLOR_MAP = {
  'midnight':'Noir','black':'Noir','starlight':'Blanc','white':'Blanc',
  'blue':'Bleu','light blue':'Bleu','deep purple':'Violet','purple':'Violet','violet':'Violet',
  'red':'Rouge','pink':'Rose','yellow':'Jaune','green':'Vert','silver':'Argent',
  'space gray':'Gris','space grey':'Gris','graphite':'Gris','natural':'Titane',
  'gold':'Or','titanium':'Titane'
};
const CAPACITY_VALUES = [64,128,256,512,1024];

const normalizeSpaces = s => String(s).replace(/\u00A0/g,' ').replace(/\s{2,}/g,' ').trim();
const capFirst = s => s ? s.charAt(0).toUpperCase()+s.slice(1) : s;

function stripMarketplace(s){
  if(!s) return '';
  let t = String(s);
  t = t.replace(/^\s*(?:amazon(?:\.com)?|vinted|leboncoin|beebs(?: by kiabi)?|rakuten|fnac|darty|cdiscount|ebay)\s*[:\-–—]\s*/i,'');
  t = t.replace(new RegExp(`\\s*[\\|\\-–—:]\\s*(?:${SITE_WORDS.join('|').replace(/\s+/g,'\\s*')}).*$`,'i'),'');
  return t.trim();
}
function stripJunk(s){
  let t = String(s);
  t = t.replace(/\b\d{1,2}\s?(?:ans|mois)\b/gi,'');
  t = t.replace(/\b\d{1,2}\s?-\s?\d{1,2}\s?(?:mois|ans)\b/gi,'');
  t = t.replace(/\b(?:taille|t\.?)\s*(?:\d{2}|xs|s|m|l|xl|xxl|xxxl)\b/gi,'');
  t = t.replace(/\b(?:xs|s|m|l|xl|xxl|xxxl)\b/gi,'');
  t = t.replace(/\b(?:neuf|comme neuf|tres bon etat|très bon état|bon etat|occasion|reconditionne|renewed|refurbished)\b/gi,'');
  t = t.replace(/\b(?:t-mobile|verizon|at&t|sfr|orange|bouygues|free)\b/gi,'');
  t = t.replace(/[–—]/g,' ').replace(/\s*-\s*/g,' ').replace(/\s{2,}/g,' ').trim(); // <- pas de tirets
  return t;
}
function detectColor(s){
  const lc = String(s).toLowerCase();
  for(const [en,fr] of Object.entries(COLOR_MAP)){ if(lc.includes(en)) return fr; }
  const m = lc.match(/\b(noir|blanc|bleu|violet|rouge|rose|jaune|vert|argent|gris|or|titane)\b/);
  return m ? capFirst(m[1]) : null;
}
function detectCapacity(s){
  const m = String(s).match(/\b(64|128|256|512|1024)\s?(?:gb|go|g)\b/i);
  return m ? parseInt(m[1],10) : null;
}
function extractIphone(s){
  const m = String(s).match(/\bi\s*phone\s*(se|[0-9]{1,2})(?:\s*(pro\s*max|pro|max|plus))?/i);
  if(!m) return null;
  const gen = m[1].toUpperCase();
  const suf = (m[2]||'').toLowerCase().replace(/\s+/g,' ').trim();
  const variant = suf==='pro max'?'Pro Max':suf==='pro'?'Pro':suf==='max'?'Max':suf==='plus'?'Plus':'';
  const model = `iPhone ${gen}${variant?' '+variant:''}`;
  return { brand:'Apple', model };
}
function extractBrandModelGeneric(s){
  const ip = extractIphone(s); if(ip) return ip;
  const brands = ['Apple','Samsung','Xiaomi','Huawei','Honor','OnePlus','Google','Sony','Nokia','Oppo','Vivo','Motorola','Quechua','Decathlon'];
  const b = brands.find(br => new RegExp(`\\b${br}\\b`,'i').test(s));
  if(b){
    const reg = new RegExp(`\\b${b}\\b\\s+([A-Za-z0-9]+(?:\\s+[A-Za-z0-9]+){0,3})`,'i');
    const mm = String(s).match(reg);
    if(mm) return { brand:b, model:`${b} ${mm[1]}` };
    return { brand:b, model:b };
  }
  return null;
}
function buildLabel({ brand, model, color, capacity }){
  let out = '';
  if(/^i\s*phone/i.test(model)){
    out = `${model.replace(/\s+/g,' ')} ${brand}`;
  } else {
    const mlc = model.toLowerCase(), blc = brand.toLowerCase();
    out = mlc.startsWith(blc) ? `${model.slice(brand.length).trim()} ${brand}`.trim() : `${model} ${brand}`.trim();
  }
  if(color) out += ` ${color}`;
  if(capacity && CAPACITY_VALUES.includes(capacity)) out += ` ${capacity} Go`;
  return normalizeSpaces(out);
}
function scoreConfidence(info, rawTitle){
  let score = 0;
  if(info.brand) score += 0.25;
  if(info.model) score += 0.35;
  if(info.color) score += 0.15;
  if(info.capacity) score += 0.15;
  if(!SITE_WORDS.some(w => String(rawTitle).toLowerCase().includes(w))) score += 0.1;
  return Math.max(0,Math.min(1,score));
}
function uniqCaseInsensitive(arr){
  const seen = new Set(), out = [];
  for(const a of arr){ const k = a.trim().toLowerCase(); if(!seen.has(k)){ seen.add(k); out.push(a.trim()); } }
  return out;
}
function normalizeTitlesAdvanced(titles=[], visionLabel=''){
  const cleaned = [];
  for(const t of titles){
    let s = stripMarketplace(t); s = stripJunk(s); s = normalizeSpaces(s); if(s) cleaned.push(s);
  }
  if(visionLabel){
    let v = stripMarketplace(visionLabel); v = stripJunk(v); v = normalizeSpaces(v); if(v) cleaned.push(v);
  }
  const candidates = [];
  for(const c of cleaned){
    const phone = extractBrandModelGeneric(c);
    if(phone){
      const color = detectColor(c);
      const capacity = detectCapacity(c);
      const label = buildLabel({...phone, color, capacity});
      const confidence = scoreConfidence({...phone, color, capacity}, c);
      candidates.push({ label, confidence, base:c, color, capacity, brand:phone.brand, model:phone.model });
    } else {
      candidates.push({ label:c, confidence:0.3, base:c });
    }
  }
  candidates.sort((a,b)=> b.confidence-a.confidence || a.label.length-b.label.length);
  const best = candidates[0] || { label:'', confidence:0 };
  let alternatives = [];

  const looksIphone = /^i\s*phone/i.test(best.label) || /i\s*phone/i.test(best.base||'');
  if(looksIphone && !best.capacity){
    const caps = [128,256,512];
    alternatives = caps.map(c => best.label.replace(/\s(64|128|256|512|1024)\s?Go/i,'').trim()+` ${c} Go`);
  }
  const colorsSeen = uniqCaseInsensitive(candidates.map(x=>x.color).filter(Boolean));
  if(colorsSeen.length>1){
    for(const col of colorsSeen){
      const withoutColor = best.label.replace(/\s(noir|blanc|bleu|violet|rouge|rose|jaune|vert|argent|gris|or|titane)\b/i,'').trim();
      alternatives.push(`${withoutColor} ${col}`.trim());
    }
  }
  alternatives = uniqCaseInsensitive(alternatives).filter(a => a.toLowerCase()!==best.label.toLowerCase());
  const needsConfirmation = best.confidence < 0.8 || alternatives.length>=1;

  return {
    label: best.label,
    color: best.color || null,
    capacity: best.capacity || null,
    confidence: Number(best.confidence.toFixed(2)),
    alternatives,
    cleanedCandidates: uniqCaseInsensitive(cleaned),
    needsConfirmation
  };
}

module.exports = {
  normalizeTitlesAdvanced,
  detectColor,
  detectCapacity,
  buildLabel
};
