// backend/src/utils/fetch-retry.js
'use strict';

const DEFAULT_TIMEOUT = 10000; // 10 secondes
const MAX_RETRIES = 2;         // 1 tentative + 2 retries = 3 essais max

/**
 * Wrapper autour de fetch avec Timeout et Retry (Backoff).
 * @param {string} url
 * @param {object} options - options fetch standard + { timeout: number, retries: number }
 */
async function fetchWithRetry(url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
    ...fetchOptions
  } = options;

  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      clearTimeout(id);

      // Si 5xx (erreur serveur), on peut réessayer.
      // Si 4xx (erreur client), on ne réessaie pas (sauf 429 si on gérait le rate limit strict)
      if (res.ok || res.status < 500) {
        return res;
      }

      // Si on est ici, c'est une erreur 5xx
      throw new Error(`HTTP ${res.status} ${res.statusText}`);

    } catch (error) {
      clearTimeout(id);
      attempt++;
      
      const isAbort = error.name === 'AbortError';
      const errorMessage = isAbort ? `Timeout of ${timeout}ms exceeded` : error.message;

      // Si on a atteint la limite, on lance l'erreur finale
      if (attempt > retries) {
        // On enrichit l'erreur avec un contexte clair
        throw new Error(`[FetchFail] ${url} : ${errorMessage}`);
      }

      console.warn(`[FetchRetry] Tentative ${attempt}/${retries} échouée vers ${url} (${errorMessage})...`);
      
      // Backoff simple : attendre 500ms * attempt
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
}

module.exports = { fetchWithRetry };