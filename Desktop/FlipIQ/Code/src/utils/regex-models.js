// backend/src/utils/regex-models.js
export function pickModelCandidates(txt, { brandHint } = {}) {
  const t = String(txt||'');
  const patterns = [
    /\bSM-[A-Z0-9]+\b/g,           // samsung
    /\b[A-Z]{1,3}-\d{3,5}\b/g,     // sony, lg...
    /\bRTX\s?\d{3,4}\b/g,          // gpu
    /\b[A-Z0-9]{2,}-\d{2,}\b/g,    // générique
  ];
  const hits = patterns.flatMap(re => [...t.matchAll(re)]).map(m => m[0]);
  const uniq = [...new Set(hits)];
  return { best: uniq[0] || null, all: uniq };
}
