import { requireAuth } from "./auth-guard.js";

if (!requireAuth()) {
  throw new Error("not authenticated");
}


// js/scan-page.js - Version avec Drag & Drop et Reset Input
(() => {
  const DEFAULT_API = 'https://api.flipiqapp.com';
  let API_BASE = (window.API_BASE || DEFAULT_API).replace(/\/$/, '');
  const MAX_FILES = 4;

  // --- Elements ---
  const dom = {
    searchBtn: document.getElementById('searchBtn'),
    generateBtn: document.getElementById('generateBtn'),
    searchInput: document.getElementById('searchInput'),
    
    // Zones
    dropzone: document.getElementById('dropzone'),
    uploadFab: document.getElementById('uploadFab'),
    fileInput: document.getElementById('fileInput'),
    thumbs: document.getElementById('thumbs'),
    addBtn: document.getElementById('addBtn'),
    
    // Feedback
    toast: document.getElementById('sellToast'),
    
    // Options
    currencySelect: document.getElementById('currencySelect'),
    swMeetup: document.getElementById('swMeetup'),
    swRecent: document.getElementById('swRecent'),
    swNever: document.getElementById('swNever'),
    langSelect: document.getElementById('langSelect'),
    
    // Résultats
    priceText: document.getElementById('priceText'),
    descText: document.getElementById('descText'),
    titleText: document.getElementById('titleText'),
    sellActions: document.getElementById('sellActions'),
    
    // Modales
    condModal: document.getElementById('condModal')
  };

  // --- Réveil Serveur ---
  fetch(`${API_BASE}/api/health`).catch(() => {}); 

  // --- Listeners ---
  if (dom.searchBtn) dom.searchBtn.addEventListener('click', generateSequence);
  if (dom.generateBtn) dom.generateBtn.addEventListener('click', generateSequence);
  if (dom.searchInput) dom.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generateSequence();
  });

  // Gestion du clic pour Upload
  if (dom.uploadFab) {
      dom.uploadFab.addEventListener('click', (e) => {
          e.stopPropagation();
          dom.fileInput.click();
      });
  }
  
  if (dom.dropzone) {
      dom.dropzone.style.cursor = 'pointer';
      
      // Click standard
      dom.dropzone.addEventListener('click', (e) => {
          if (!e.target.closest('#uploadFab')) dom.fileInput.click();
      });

      // --- AJOUT DRAG & DROP ---
      
      // 1. Survol avec fichier
      dom.dropzone.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dom.dropzone.classList.add('drag-active');
      });

      // 2. Sortie de la zone
      dom.dropzone.addEventListener('dragleave', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dom.dropzone.classList.remove('drag-active');
      });

      // 3. Relâchement du fichier
      dom.dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          dom.dropzone.classList.remove('drag-active');
          
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              addPhotos(e.dataTransfer.files);
          }
      });
  }

  // --- Variables ---
  let currentPhotos = [];
  let lastScanResult = null;
  let isBusy = false;
  let userInputData = { condition: null };
  let photosReady = false;

  // --- Init ---
  document.addEventListener('DOMContentLoaded', () => {
    // Rafraîchir le quota au chargement de la page
    setTimeout(refreshQuota, 500);

    // Vérifier si on doit afficher une annonce préchargée depuis l'historique
    checkPreloadedListing();
  });

  // --- Afficher annonce préchargée ---
  function checkPreloadedListing() {
    try {
      const preloadData = sessionStorage.getItem('flipiq.preload');
      if (!preloadData) return;

      const data = JSON.parse(preloadData);
      sessionStorage.removeItem('flipiq.preload');

      // Si showResult est true, afficher directement le résultat
      if (data.showResult) {
        displayPreloadedResult(data);
      }
    } catch (e) {
      console.error('Erreur chargement préload:', e);
    }
  }

  function displayPreloadedResult(data) {
    const beforeState = document.getElementById('beforeScanState');
    const afterState = document.getElementById('afterScanState');

    if (beforeState) beforeState.style.display = 'none';
    if (afterState) afterState.style.display = 'block';

    // Afficher les données
    if (dom.titleText) dom.titleText.textContent = data.title || 'Sans titre';
    if (dom.descText) dom.descText.textContent = data.description || 'Pas de description.';
    if (dom.priceText) {
      dom.priceText.textContent = data.price ? `${data.price} ${data.currency || 'EUR'}` : 'N/A';
    }

    // Afficher la photo si disponible
    const gallery = document.getElementById('photoGallery');
    const galleryScroll = document.getElementById('galleryScroll');
    if (gallery && galleryScroll && data.image) {
      galleryScroll.innerHTML = `
        <div class="gallery-item">
          <img src="${data.image}" alt="Photo" />
        </div>
      `;
      gallery.style.display = 'block';
    } else if (gallery) {
      gallery.style.display = 'none';
    }

    // Configurer le copier-coller
    setupClickToCopy('resTitleBox', data.title || '');
    setupClickToCopy('resPriceBox', data.price ? `${data.price}` : '');
    setupClickToCopy('resDescBox', data.description || '');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- Helpers UI ---
  function showToast(msg, variant = 'info') {
    if (!dom.toast) return;
    const text = (window.FlipIQ_i18n && window.FlipIQ_i18n.t && window.FlipIQ_i18n.t(msg)) || msg;
    dom.toast.textContent = text;
    dom.toast.className = `sell-toast is-visible ${variant}`;
    setTimeout(() => dom.toast.classList.remove('is-visible'), 3500);
  }

  function setSendState(state) {
    if (!dom.searchBtn) return;
    if (state === 'scanning' || state === 'generating') {
      dom.searchBtn.disabled = true;
      dom.searchBtn.classList.add('is-loading');
    } else {
      dom.searchBtn.disabled = false;
      dom.searchBtn.classList.remove('is-loading');
    }
  }

  function setThumbsLoading(isLoading) {
    if (!dom.thumbs) return;
    dom.thumbs.querySelectorAll('.attachment-thumb').forEach((el) => {
      el.classList.toggle('is-loading', !!isLoading);
    });
  }

  // --- Gestion Images ---
  function fileToThumbnail(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const maxWidth = 300; // Augmenté pour meilleure qualité
          const scale = maxWidth / img.width;
          canvas.width = maxWidth;
          canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85)); // Qualité augmentée
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function compressImage(file) {
    return new Promise((resolve) => {
      if (!file.type.match(/image.*/) || file.size < 1024 * 1024) return resolve(file);
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxWidth = 1200; 
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob) {
                const optimizedFile = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
                resolve(optimizedFile);
            } else resolve(file);
          }, 'image/jpeg', 0.8);
        };
      };
    });
  }

  function renderThumbnails() {
    if (!dom.thumbs) return;
    dom.thumbs.querySelectorAll('.attachment-thumb').forEach((n) => n.remove());
    dom.thumbs.style.display = currentPhotos.length ? 'flex' : 'none';
    currentPhotos.forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const wrap = document.createElement('div');
      wrap.className = 'attachment-thumb';

      const img = document.createElement('img');
      img.src = url;
      img.alt = `Photo ${i + 1}`;
      img.loading = 'eager';
      img.decoding = 'sync';
      img.setAttribute('data-lazy-enhanced', 'false');
      // Force l'affichage de l'image
      img.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;display:block;z-index:2;';
      img.onload = () => {
        console.log(`✓ Image ${i + 1} chargée:`, url);
        wrap.classList.add('thumb-loaded');
      };
      img.onerror = (e) => {
        console.error(`✗ Erreur chargement image ${i + 1}:`, e);
        // Fallback: afficher un placeholder
        wrap.style.backgroundColor = '#ddd6fe';
      };
      wrap.appendChild(img);

      const overlay = document.createElement('div');
      overlay.className = 'thumb-loader';
      const loadingGif = document.createElement('img');
      loadingGif.src = '/img/animation.gif';
      loadingGif.alt = 'Analyse en cours...';
      loadingGif.className = 'loader-anim';
      overlay.appendChild(loadingGif);
      wrap.appendChild(overlay);

      const btn = document.createElement('button');
      btn.className = 'remove-thumb';
      btn.innerHTML = '×';
      btn.type = 'button';
      btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          removePhoto(i);
      };
      wrap.appendChild(btn);

      if (dom.addBtn) dom.thumbs.insertBefore(wrap, dom.addBtn);
      else dom.thumbs.appendChild(wrap);
    });
  }

  function addPhotos(fileList) {
    if (!fileList || !fileList.length) return;
    const newFiles = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!newFiles.length) return;
    if (window.placeholderAnimator) window.placeholderAnimator.stop = true;
    currentPhotos = [...currentPhotos, ...newFiles].slice(0, MAX_FILES);
    photosReady = true;
    renderThumbnails();
    // NOUVEAU FLUX: Animation → Formulaire → Génération
    showLoadingAnimationThenForm();
  }

  // --- MODIFICATION SUPPRESSION PHOTO ---
  function removePhoto(i) {
    currentPhotos.splice(i, 1);
    photosReady = true;
    renderThumbnails();
    
    if (currentPhotos.length === 0) {
      lastScanResult = null;
      if(dom.titleText) dom.titleText.textContent = '...';
      if(dom.descText) dom.descText.textContent = '...';
      if(dom.priceText) dom.priceText.textContent = '--';
      
      // AJOUT : On vide la barre de recherche si plus de photos
      if(dom.searchInput) {
          dom.searchInput.value = '';
          dom.searchInput.setAttribute('placeholder', 'Search your product');
      }

      const beforeState = document.getElementById('beforeScanState');
      const afterState = document.getElementById('afterScanState');
      if (beforeState && afterState) {
          afterState.style.display = 'none';
          beforeState.style.display = 'block';
      }
      if (window.animatePlaceholders) {
        window.placeholderAnimator = { stop: false };
        window.animatePlaceholders();
      } else {
        window.placeholderAnimator = { stop: false };
        animate();
      }
    }
  }

  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', () => {
      addPhotos(dom.fileInput.files);
      dom.fileInput.value = '';
    });
  }
  if (dom.addBtn) {
    dom.addBtn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation(); dom.fileInput?.click();
    });
  }

  // --- Gestion Modal Quota Épuisé ---
  const quotaModal = document.getElementById('quotaModal');
  const quotaCancel = document.getElementById('quotaCancel');
  const quotaBackdrop = document.querySelector('[data-close-quota]');

  function showQuotaModal() {
    if (quotaModal) {
      quotaModal.setAttribute('aria-hidden', 'false');
    }
  }

  function hideQuotaModal() {
    if (quotaModal) {
      quotaModal.setAttribute('aria-hidden', 'true');
    }
  }

  if (quotaCancel) {
    quotaCancel.addEventListener('click', hideQuotaModal);
  }
  if (quotaBackdrop) {
    quotaBackdrop.addEventListener('click', hideQuotaModal);
  }

  // --- Mise à jour compteur navbar ---
  function updateNavbarQuota(remaining, isPremium) {
    const counterEl = document.getElementById('quotaCounterValue');
    if (counterEl) {
      if (isPremium || remaining === -1) {
        counterEl.textContent = '∞';
      } else {
        counterEl.textContent = remaining;
      }
    }
  }

  // --- Erreur personnalisée pour quota épuisé ---
  class QuotaExceededError extends Error {
    constructor(quotaData) {
      super('Quota épuisé');
      this.name = 'QuotaExceededError';
      this.quota = quotaData;
    }
  }

  async function apiJSON(path, opts = {}) {
    const r = await fetch(`${API_BASE}${path}`, { ...opts, credentials: 'include' });

    // Gérer erreur 429 (quota épuisé)
    if (r.status === 429) {
      const errorData = await r.json().catch(() => ({}));
      throw new QuotaExceededError(errorData.quota || {});
    }

    if (!r.ok) throw new Error('Erreur API');
    return r.json();
  }

  // --- Récupérer et mettre à jour le quota depuis l'API ---
  async function refreshQuota() {
    try {
      const data = await apiJSON('/api/plans/me', { method: 'GET' });
      if (data) {
        const isPremium = data.isPremium || data.plan === 'premium';
        const remaining = data.remainingGenerations ?? 3;
        updateNavbarQuota(remaining, isPremium);
        updatePlanCard(isPremium, remaining);
        // Mettre à jour aussi le tooltip de la navbar
        if (window.updateNavbarQuotaTooltip) {
          window.updateNavbarQuotaTooltip(isPremium, remaining);
        }
      }
    } catch (e) {
      console.warn('Impossible de récupérer le quota:', e);
    }
  }

  // --- Mise à jour de la carte plan + tooltip ---
  function updatePlanCard(isPremium, remaining) {
    const planNameDisplay = document.getElementById('planNameDisplay');
    const planSubtitleDisplay = document.getElementById('planSubtitleDisplay');
    const planTooltipContent = document.getElementById('planTooltipContent');
    const scanPlanCard = document.getElementById('scanPlanCard');

    // Mettre à jour le nom du plan
    if (planNameDisplay) {
      planNameDisplay.textContent = isPremium ? 'Premium' : 'Free';
    }

    // Mettre à jour le sous-titre
    if (planSubtitleDisplay) {
      if (isPremium) {
        planSubtitleDisplay.textContent = 'Générations illimitées';
      } else {
        planSubtitleDisplay.textContent = `${remaining} génération${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`;
      }
    }

    // Ajouter/retirer la classe premium sur la carte
    if (scanPlanCard) {
      scanPlanCard.classList.toggle('is-premium', isPremium);
    }

    // Mettre à jour le contenu du tooltip
    if (planTooltipContent) {
      if (isPremium) {
        planTooltipContent.innerHTML = `
          <div class="tooltip-premium">
            <p class="tooltip-title">Félicitations !</p>
            <p class="tooltip-text">Vous avez le <strong>Premium</strong>.<br>Générations illimitées disponibles.</p>
          </div>
        `;
      } else {
        planTooltipContent.innerHTML = `
          <div class="tooltip-free">
            <p class="tooltip-title">Plan Free</p>
            <p class="tooltip-text">Il vous reste <strong>${remaining}</strong> génération${remaining > 1 ? 's' : ''} aujourd'hui.</p>
            <a href="/premium" class="tooltip-upgrade-btn">Passer en Premium →</a>
          </div>
        `;
      }
    }
  }

  // --- NOUVEAU FLUX: Animation → Formulaire → Génération ---
  async function showLoadingAnimationThenForm() {
    if (isBusy || !currentPhotos.length) return;

    // Créer et afficher le modal d'animation
    const animModal = document.createElement('div');
    animModal.id = 'loadingAnimationModal';
    animModal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      backdrop-filter: blur(10px);
    `;

    const animContainer = document.createElement('div');
    animContainer.style.cssText = `
      max-width: 90%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    `;

    const animImg = document.createElement('img');
    animImg.src = '/img/listCreation.gif';
    animImg.alt = 'Préparation de votre annonce...';
    animImg.style.cssText = `
      max-width: 100%;
      max-height: 70vh;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;

    const animText = document.createElement('p');
    animText.textContent = 'Préparation de votre annonce...';
    animText.style.cssText = `
      color: white;
      font-size: 1.2rem;
      font-weight: 600;
      margin-top: 24px;
      text-align: center;
    `;

    animContainer.appendChild(animImg);
    animContainer.appendChild(animText);
    animModal.appendChild(animContainer);
    document.body.appendChild(animModal);

    // Attendre 3 secondes pour que l'utilisateur voit l'animation
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Fermer le modal d'animation
    animModal.remove();

    // Afficher le modal de condition
    if (!userInputData.condition) {
      const c = await askCondition();
      if (!c) {
        // L'utilisateur a annulé
        return;
      }
      userInputData.condition = c;
    }

    // Maintenant lancer le scan puis la génération
    await performScanAndGeneration();
  }

  // Fonction qui fait le scan puis la génération
  async function performScanAndGeneration() {
    if (isBusy || !currentPhotos.length) return;
    isBusy = true;
    setSendState('scanning');
    if (dom.uploadFab) dom.uploadFab.classList.add('is-loading');

    try {
      // 1. Faire le scan d'abord
      const compressedFiles = await Promise.all(currentPhotos.map(f => compressImage(f)));
      const fd = new FormData();
      compressedFiles.forEach((f) => fd.append('images', f));

      const json = await apiJSON('/api/ai/scan', { method: 'POST', body: fd });
      lastScanResult = json;

      if (json.identification && json.identification.label) {
        const detectedName = json.identification.label;
        if (dom.searchInput) {
          dom.searchInput.value = detectedName;
        }
      }

      setSendState('ready');

      // 2. Lancer la génération
      await performGeneration();

    } catch (e) {
      console.error(e);
      if (e instanceof QuotaExceededError) {
        showQuotaModal();
        showToast('Quota épuisé', 'warn');
      } else {
        showToast('Erreur lors de l\'analyse', 'error');
      }
      setSendState('idle');
    } finally {
      isBusy = false;
      if (dom.uploadFab) dom.uploadFab.classList.remove('is-loading');
      refreshQuota();
    }
  }

  // --- SCAN (ancienne version, gardée pour compatibilité) ---
  async function startAutoScan() {
    if (isBusy || !currentPhotos.length) return;
    isBusy = true;
    setSendState('scanning');
    if (dom.uploadFab) dom.uploadFab.classList.add('is-loading');
    if (dom.searchInput) dom.searchInput.setAttribute('placeholder', 'Analyse de l\'image en cours...');

    try {
      const compressedFiles = await Promise.all(currentPhotos.map(f => compressImage(f)));
      const fd = new FormData();
      compressedFiles.forEach((f) => fd.append('images', f));

      const json = await apiJSON('/api/ai/scan', { method: 'POST', body: fd });
      lastScanResult = json;
      if (json.identification && json.identification.label) {
        const detectedName = json.identification.label;
        if (dom.searchInput) {
          dom.searchInput.value = detectedName;
          dom.searchInput.style.transition = 'background-color 0.3s';
          dom.searchInput.style.backgroundColor = '#f0fdf4';
          setTimeout(() => (dom.searchInput.style.backgroundColor = ''), 1000);
        }
      }
      showToast('Scan terminé', 'success');
      setSendState('ready');

      // FLUX AUTOMATIQUE: Scan → Modal état → Modal specs → Génération
      // Enchaîner directement sans avoir à cliquer sur "générer"
      if (window.placeholderAnimator) window.placeholderAnimator.stop = true;

      if (!userInputData.condition) {
        const c = await askCondition();
        if (c) {
          userInputData.condition = c;
          // Lancer automatiquement la génération après la sélection de l'état
          performGeneration();
        }
      } else {
        // Si condition déjà définie, lancer directement
        performGeneration();
      }
    } catch (e) {
      console.error(e);
      // Gérer erreur quota épuisé
      if (e instanceof QuotaExceededError) {
        showQuotaModal();
        showToast('Quota épuisé', 'warn');
      } else {
        showToast('Erreur scan', 'error');
      }
      setSendState('idle');
    } finally {
      isBusy = false;
      if (dom.uploadFab) dom.uploadFab.classList.remove('is-loading');
      if (dom.searchInput && !dom.searchInput.value) dom.searchInput.setAttribute('placeholder', 'Search your product');
      // Rafraîchir le quota dans la navbar
      refreshQuota();
    }
  }

  // --- Modales ---
  function askCondition() {
    return new Promise((resolve) => {
      if (!dom.condModal) return resolve('bon état');
      const choices = dom.condModal.querySelectorAll('button[data-cond]');
      let selected = null;
      choices.forEach((b) => {
        b.classList.remove('is-active');
        b.onclick = () => {
          choices.forEach((x) => x.classList.remove('is-active'));
          b.classList.add('is-active');
          selected = b.dataset.cond;
          const okBtn = dom.condModal.querySelector('#condOk');
          if (okBtn) okBtn.disabled = false;
        };
      });
      const okBtn = dom.condModal.querySelector('#condOk');
      const cancelBtn = dom.condModal.querySelector('#condCancel');
      if (okBtn) okBtn.onclick = () => {
        dom.condModal.setAttribute('aria-hidden', 'true');
        okBtn.blur();
        resolve(selected || 'bon état');
      };
      if (cancelBtn) cancelBtn.onclick = () => {
        dom.condModal.setAttribute('aria-hidden', 'true');
        resolve(null);
      };
      dom.condModal.setAttribute('aria-hidden', 'false');
    });
  }

  async function generateSequence() {
    const title = dom.searchInput?.value.trim();
    if (!title) {
      showToast('Veuillez entrer un titre ou une photo', 'warn');
      dom.searchInput?.focus();
      return;
    }
    if (isBusy) return;
    if (window.placeholderAnimator) window.placeholderAnimator.stop = true;

    // Si génération sans photos (text-only), demander la condition
    if (!currentPhotos.length && !userInputData.condition) {
      const c = await askCondition();
      if (!c) return;
      userInputData.condition = c;
    }

    performGeneration();
  }

  // --- Prix ---
  function parsePriceRobust(str) {
      if (typeof str === 'number') return str;
      if (!str) return 0;
      let clean = str.replace(/[^\d.,]/g, '').trim();
      if (clean.includes('.') && clean.includes(',')) {
          const lastDot = clean.lastIndexOf('.');
          const lastComma = clean.lastIndexOf(',');
          if (lastDot < lastComma) clean = clean.replace(/\./g, '').replace(',', '.');
          else clean = clean.replace(/,/g, '');
      } else if (clean.includes(',')) {
          clean = clean.replace(',', '.');
      } 
      return parseFloat(clean);
  }

  function recalculatePriceLocal(samples, refinedData) {
      if (!samples || !samples.length) return null;
      const keywords = [];
      if (refinedData.storage) keywords.push(refinedData.storage.replace(/\s?Go|GB|Tb/i, '').trim());
      if (refinedData.model) keywords.push(refinedData.model.trim());
      const matchingSamples = samples.filter(sample => {
          const title = (sample.title || '').toLowerCase();
          if (refinedData.storage) {
              const storageVal = refinedData.storage.replace(/\s?Go|GB|Tb|SSD|HDD/gi, '').trim();
              if (storageVal && !title.includes(storageVal.toLowerCase())) return false;
          }
          return true;
      });
      const validSamples = matchingSamples.length > 0 ? matchingSamples : samples;
      let prices = validSamples
          .map(s => parsePriceRobust(s.price || s.extracted_price))
          .filter(p => !isNaN(p) && p > 0);
      const maxPrice = Math.max(...prices);
      if (maxPrice > 100) {
          prices = prices.filter(p => p > 20 && p > (maxPrice * 0.1));
      }
      prices.sort((a, b) => a - b);
      if (!prices.length) return null;
      const mid = Math.floor(prices.length / 2);
      return Math.round(prices.length % 2 !== 0 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2);
  }

  // --- Créer identification à partir du texte (pour génération text-only) ---
  // Catégories alignées avec backend/PromptBuilder.js pour parité avec app mobile
  function createIdentificationFromText(text) {
    if (!text) return null;
    const t = text.toLowerCase();

    // Détection de catégorie basée sur les mots-clés (aligné avec pickCategory backend)
    let category = 'generic';
    let brand = '';
    let model = '';

    // Vape / E-cigarette (nouveau)
    if (/vape|vaping|e-cig|ecig|e cigarette|geekvape|aegis|vaporesso|voopoo|smok|innokin/.test(t)) {
      category = 'vape';
      if (/geekvape|aegis/.test(t)) brand = 'Geekvape';
      else if (/vaporesso/.test(t)) brand = 'Vaporesso';
      else if (/voopoo/.test(t)) brand = 'Voopoo';
      else if (/smok/.test(t)) brand = 'SMOK';
      else if (/innokin/.test(t)) brand = 'Innokin';
    }
    // Phone / Smartphone
    else if (/iphone|samsung|smartphone|mobile|galaxy|pixel|oneplus|xiaomi|huawei|téléphone|telephone|oppo|realme/.test(t)) {
      category = 'phone';
      if (/iphone/.test(t)) brand = 'Apple';
      else if (/samsung|galaxy/.test(t)) brand = 'Samsung';
      else if (/pixel/.test(t)) brand = 'Google';
      else if (/oneplus/.test(t)) brand = 'OnePlus';
      else if (/xiaomi|redmi/.test(t)) brand = 'Xiaomi';
      else if (/huawei/.test(t)) brand = 'Huawei';
      else if (/oppo/.test(t)) brand = 'Oppo';
      const modelMatch = text.match(/(?:iphone|galaxy|pixel|oneplus|xiaomi|huawei)\s*(\d+\s*\w*)/i);
      if (modelMatch) model = modelMatch[0];
    }
    // Laptop (aligné avec backend: 'laptop' pas 'pc')
    else if (/laptop|ordinateur|macbook|pc portable|imac|dell|hp|lenovo|asus|acer|thinkpad|chromebook|notebook/.test(t)) {
      category = 'laptop';
      if (/macbook|imac/.test(t)) brand = 'Apple';
      else if (/dell/.test(t)) brand = 'Dell';
      else if (/hp|hewlett/.test(t)) brand = 'HP';
      else if (/lenovo|thinkpad/.test(t)) brand = 'Lenovo';
      else if (/asus/.test(t)) brand = 'Asus';
      else if (/acer/.test(t)) brand = 'Acer';
      else if (/msi/.test(t)) brand = 'MSI';
    }
    // Console / Gaming
    else if (/playstation|ps5|ps4|ps3|xbox|switch|nintendo|console/.test(t)) {
      category = 'console';
      if (/playstation|ps5|ps4|ps3/.test(t)) brand = 'Sony';
      else if (/xbox/.test(t)) brand = 'Microsoft';
      else if (/nintendo|switch/.test(t)) brand = 'Nintendo';
    }
    // Shoes (aligné avec backend: 'shoes' pas 'sneakers')
    else if (/chaussure|sneaker|basket|nike|adidas|puma|jordan|new balance|converse|vans|asics/.test(t)) {
      category = 'shoes';
      if (/nike|jordan|air max|air force/.test(t)) brand = 'Nike';
      else if (/adidas|yeezy/.test(t)) brand = 'Adidas';
      else if (/puma/.test(t)) brand = 'Puma';
      else if (/new balance/.test(t)) brand = 'New Balance';
      else if (/converse/.test(t)) brand = 'Converse';
      else if (/vans/.test(t)) brand = 'Vans';
    }
    // Tablet
    else if (/tablette|tablet|ipad|galaxy tab/.test(t)) {
      category = 'tablet';
      if (/ipad/.test(t)) brand = 'Apple';
      else if (/galaxy tab|samsung/.test(t)) brand = 'Samsung';
    }
    // Wearable (aligné avec backend: 'wearable' pas 'watch')
    else if (/montre|watch|apple watch|smartwatch|fitbit|garmin/.test(t)) {
      category = 'wearable';
      if (/apple watch/.test(t)) brand = 'Apple';
      else if (/samsung/.test(t)) brand = 'Samsung';
      else if (/garmin/.test(t)) brand = 'Garmin';
      else if (/fitbit/.test(t)) brand = 'Fitbit';
    }
    // Bag
    else if (/sac|bag|backpack|eastpak|louis vuitton|gucci|hermes/.test(t)) {
      category = 'bag';
      if (/eastpak/.test(t)) brand = 'Eastpak';
      else if (/louis vuitton/.test(t)) brand = 'Louis Vuitton';
      else if (/gucci/.test(t)) brand = 'Gucci';
    }
    // Camera
    else if (/appareil photo|camera|reflex|canon|nikon|sony|fuji|eos|alpha|lumix/.test(t)) {
      category = 'camera';
      if (/canon|eos/.test(t)) brand = 'Canon';
      else if (/nikon/.test(t)) brand = 'Nikon';
      else if (/sony|alpha/.test(t)) brand = 'Sony';
      else if (/fuji/.test(t)) brand = 'Fujifilm';
      else if (/lumix|panasonic/.test(t)) brand = 'Panasonic';
    }
    // Headphones
    else if (/casque|headphone|earbud|airpods|buds|ecouteur/.test(t)) {
      category = 'headphones';
      if (/airpods/.test(t)) brand = 'Apple';
      else if (/buds|samsung/.test(t)) brand = 'Samsung';
      else if (/sony/.test(t)) brand = 'Sony';
      else if (/bose/.test(t)) brand = 'Bose';
    }
    // Display (monitor/TV)
    else if (/ecran|monitor|tv|television|moniteur/.test(t)) {
      category = 'display';
    }
    // Speaker
    else if (/enceinte|speaker|soundbar|audio|sonos|bose|jbl/.test(t)) {
      category = 'speaker';
    }
    // Furniture
    else if (/meuble|furniture|bureau|desk|table|chaise|chair/.test(t)) {
      category = 'furniture';
    }
    // Bike
    else if (/velo|vélo|bike|scooter|trottinette/.test(t)) {
      category = 'bike';
    }
    // Collectible
    else if (/figurine|collectible|lego|jouet|toy/.test(t)) {
      category = 'collectible';
    }
    // Clothes (aligné avec backend: 'clothes' pas 'clothing')
    else if (/t-shirt|tshirt|polo|chemise|pull|sweat|hoodie|veste|jacket|pantalon|jean|dress|skirt|robe|jupe/.test(t)) {
      category = 'clothes';
    }

    // Extraire stockage si mentionné
    let storage = '';
    const storageMatch = text.match(/(\d+)\s*(go|gb|to|tb)/i);
    if (storageMatch) {
      storage = `${storageMatch[1]} ${storageMatch[2].toUpperCase() === 'TB' || storageMatch[2].toUpperCase() === 'TO' ? 'To' : 'Go'}`;
    }

    // Extraire couleur si mentionnée
    let color = '';
    const colors = ['noir', 'blanc', 'bleu', 'rouge', 'vert', 'gris', 'rose', 'or', 'argent', 'black', 'white', 'blue', 'red', 'green', 'grey', 'gray', 'pink', 'gold', 'silver'];
    for (const c of colors) {
      if (t.includes(c)) {
        color = c.charAt(0).toUpperCase() + c.slice(1);
        break;
      }
    }

    return {
      label: text,
      category: category,
      brand: brand || '',
      model: model || '',
      storage: storage,
      color: color,
      missingFields: []
    };
  }

  // --- EXTRACTION DE SPECS DEPUIS LE LABEL/OCR ---
  // Parse le label détecté et l'OCR pour extraire des specs structurées
  function extractSpecsFromLabelAndOcr(identification, ocrData) {
    const specs = {};
    if (!identification) return specs;

    const label = (identification.label || '').toLowerCase();
    const ocrText = (ocrData?.fullText || '').toLowerCase();
    const combined = `${label} ${ocrText}`;

    // Marque (depuis identification ou parsing)
    if (identification.brand) {
      specs.brand = identification.brand;
    }

    // Modèle (depuis identification ou parsing)
    if (identification.model) {
      specs.model = identification.model;
    }

    // Couleur (depuis identification ou parsing)
    if (identification.color) {
      specs.color = identification.color;
    } else {
      // Essayer d'extraire la couleur du label
      const colors = {
        'noir': 'Noir', 'black': 'Noir', 'blanc': 'Blanc', 'white': 'Blanc',
        'bleu': 'Bleu', 'blue': 'Bleu', 'rouge': 'Rouge', 'red': 'Rouge',
        'vert': 'Vert', 'green': 'Vert', 'gris': 'Gris', 'gray': 'Gris', 'grey': 'Gris',
        'rose': 'Rose', 'pink': 'Rose', 'or': 'Or', 'gold': 'Or',
        'argent': 'Argent', 'silver': 'Argent', 'violet': 'Violet', 'purple': 'Violet',
        'jaune': 'Jaune', 'yellow': 'Jaune', 'orange': 'Orange',
        'midnight': 'Noir', 'starlight': 'Blanc', 'sierra blue': 'Bleu Sierra',
        'graphite': 'Graphite', 'pacific blue': 'Bleu Pacifique',
        'alpine green': 'Vert Alpin', 'deep purple': 'Violet Profond'
      };
      for (const [key, value] of Object.entries(colors)) {
        if (combined.includes(key)) {
          specs.color = value;
          break;
        }
      }
    }

    // Stockage (Go/GB/To/TB)
    const storageMatch = combined.match(/(\d+)\s*(go|gb|to|tb)/i);
    if (storageMatch) {
      const size = storageMatch[1];
      const unit = storageMatch[2].toUpperCase();
      specs.storage = `${size} ${unit === 'TB' || unit === 'TO' ? 'To' : 'Go'}`;
    }

    // RAM (pour PC/laptops)
    const ramMatch = combined.match(/(\d+)\s*(go|gb)\s*(ram|de ram|memory)/i);
    if (ramMatch) {
      specs.ram = `${ramMatch[1]} Go`;
    } else {
      // Pattern alternatif: "16GB RAM" ou "RAM 16Go"
      const ramAlt = combined.match(/(ram|mémoire)\s*:?\s*(\d+)\s*(go|gb)/i) ||
                     combined.match(/(\d+)\s*(go|gb)\s+ram/i);
      if (ramAlt) {
        const ramSize = ramAlt[2] || ramAlt[1];
        specs.ram = `${ramSize} Go`;
      }
    }

    // Processeur (Intel/AMD/Apple Silicon)
    const processorPatterns = [
      /intel\s*(core\s*)?(i[3579][-\s]?\d{4,5}\w*)/i,
      /amd\s*ryzen\s*(\d)\s*(\d{4}\w*)/i,
      /(m[1234]\s*(pro|max|ultra)?)/i,
      /apple\s*silicon\s*(m[1234])/i,
      /(core\s*i[3579])/i
    ];
    for (const pattern of processorPatterns) {
      const match = combined.match(pattern);
      if (match) {
        specs.processor = match[0].trim();
        break;
      }
    }

    // GPU (pour PC gaming)
    const gpuPatterns = [
      /nvidia\s*(geforce\s*)?(rtx|gtx)\s*\d{4}(\s*ti)?/i,
      /amd\s*radeon\s*(rx\s*)?\d{4}\w*/i,
      /intel\s*(iris|uhd|hd)\s*(plus|xe)?\s*\d*/i
    ];
    for (const pattern of gpuPatterns) {
      const match = combined.match(pattern);
      if (match) {
        specs.gpu = match[0].trim();
        break;
      }
    }

    // Taille d'écran
    const screenMatch = combined.match(/(\d{1,2}[.,]?\d?)\s*(pouces|"|''|inch)/i);
    if (screenMatch) {
      specs.screen_size = `${screenMatch[1].replace(',', '.')}"`;
    }

    // Pointure (pour chaussures)
    const shoeCategories = ['sneaker', 'shoe', 'basket', 'chaussure', 'jordan', 'nike', 'adidas'];
    if (shoeCategories.some(cat => combined.includes(cat))) {
      const sizeMatch = combined.match(/\b(3[6-9]|4[0-9]|50)([.,]5)?\b/);
      if (sizeMatch) {
        specs.size = sizeMatch[0].replace(',', '.');
      }
    }

    // Taille vêtement
    const clothCategories = ['shirt', 't-shirt', 'pull', 'sweat', 'veste', 'jacket', 'hoodie'];
    if (clothCategories.some(cat => combined.includes(cat))) {
      const clothSizeMatch = combined.match(/\b(xxs|xs|s|m|l|xl|xxl|xxxl)\b/i);
      if (clothSizeMatch) {
        specs.size = clothSizeMatch[0].toUpperCase();
      }
    }

    // SSD/HDD (pour PC)
    if (combined.includes('ssd')) {
      specs.storage_type = 'SSD';
    } else if (combined.includes('hdd')) {
      specs.storage_type = 'HDD';
    }

    // Batterie (%)
    const batteryMatch = combined.match(/batterie\s*:?\s*(\d{1,3})\s*%/i) ||
                         combined.match(/battery\s*:?\s*(\d{1,3})\s*%/i);
    if (batteryMatch) {
      specs.battery_health = batteryMatch[1];
    }

    // Accessoires depuis l'OCR
    const accessoryKeywords = ['chargeur', 'charger', 'câble', 'cable', 'boîte', 'box', 'étui', 'case', 'écouteurs', 'airpods'];
    const foundAccessories = accessoryKeywords.filter(kw => combined.includes(kw));
    if (foundAccessories.length > 0) {
      specs.accessories = foundAccessories.join(', ');
    }

    console.log('📋 Specs extraites du label/OCR:', specs);
    return specs;
  }

  // --- GENERATION ---
  // Nouveau flux : État → Formulaires → Animation → API
  async function performGeneration() {
    isBusy = true;
    setSendState('generating');

    let detectedPrice = null;
    if (lastScanResult && lastScanResult.pricing && lastScanResult.pricing.median) {
        detectedPrice = lastScanResult.pricing.median;
    }

    // Mapper la condition utilisateur vers usedGrade pour parité avec app mobile
    const conditionToGradeMap = {
      'neuf': 'like_new',
      'new': 'like_new',
      'comme_neuf': 'like_new',
      'like_new': 'like_new',
      'tres_bon': 'excellent',
      'excellent': 'excellent',
      'bon': 'good',
      'good': 'good',
      'correct': 'fair',
      'fair': 'fair',
      'use': 'poor',
      'poor': 'poor'
    };
    const usedGrade = conditionToGradeMap[userInputData.condition] || 'good';

    // Récupérer la catégorie du scan ou du texte
    const categoryId = lastScanResult?.identification?.category || null;

    const basePayload = {
      title: dom.searchInput.value,
      condition: userInputData.condition === 'neuf' || userInputData.condition === 'new' ? 'new' : 'used',
      usedGrade: usedGrade,
      categoryId: categoryId,
      rawScan: lastScanResult,
      priceHint: detectedPrice,
      currency: dom.currencySelect?.value || 'EUR',
      lang: dom.langSelect?.value || 'fr',
      useTemplate: true, // Forcer le mode template (emojis) comme l'app mobile
      options: {
        meetup: dom.swMeetup?.checked,
        recent: dom.swRecent?.checked,
        never_worn: dom.swNever?.checked
      }
    };

    // --- NOUVEAU FLUX : Formulaires AVANT animation ---
    let identificationData = lastScanResult && lastScanResult.identification;

    // Extraire les specs du label et de l'OCR pour enrichir les données
    const extractedSpecs = extractSpecsFromLabelAndOcr(
      identificationData,
      lastScanResult?.ocr
    );

    // Fusionner les specs extraites avec les données d'identification
    if (identificationData) {
      identificationData = {
        ...identificationData,
        ...extractedSpecs,
        // Garder les valeurs d'identification si déjà présentes
        brand: identificationData.brand || extractedSpecs.brand,
        model: identificationData.model || extractedSpecs.model,
        color: identificationData.color || extractedSpecs.color
      };
    }

    // Si pas de scan (text-only), créer un objet d'identification à partir du texte
    if (!identificationData && dom.searchInput?.value) {
      identificationData = createIdentificationFromText(dom.searchInput.value);
      // Enrichir avec l'extraction de specs
      const textSpecs = extractSpecsFromLabelAndOcr({ label: dom.searchInput.value }, null);
      identificationData = {
        ...identificationData,
        ...textSpecs,
        brand: identificationData.brand || textSpecs.brand,
        model: identificationData.model || textSpecs.model,
        color: identificationData.color || textSpecs.color
      };
    }

    if (window.ProductRefiner && identificationData) {
      console.log('📥 Données envoyées au ProductRefiner:', JSON.stringify(identificationData, null, 2));

      // Afficher le formulaire ProductRefiner AVANT l'animation
      window.ProductRefiner.refine(identificationData, async (refinedData) => {
        console.log('✅ Données raffinées par l\'utilisateur:', JSON.stringify(refinedData, null, 2));

        // Mapper catégorie vers type lisible pour le titre
        const categoryToType = {
          'phone': 'Smartphone',
          'pc': 'PC Portable',
          'laptop': 'PC Portable',
          'sneakers': 'Sneakers',
          'shoes': 'Sneakers',
          'console': 'Console',
          'tablet': 'Tablette',
          'watch': 'Montre',
          'bag': 'Sac',
          'camera': 'Appareil Photo',
          'clothing': refinedData.type || 'Vêtement',
          'clothes': refinedData.type || 'Vêtement',
          'vape': 'Vape',
          'headphones': 'Casque Audio',
          'wearable': 'Montre Connectée',
          'display': 'Écran',
          'speaker': 'Enceinte',
          'default': ''
        };
        const detectedCategory = identificationData?.category || refinedCategoryId || 'default';
        const itemType = categoryToType[detectedCategory] || '';

        // Construire le titre : Type + Marque + Modèle + Specs (sans couleur)
        const newTitleComponents = [
          itemType,
          refinedData.brand,
          refinedData.model,
          refinedData.storage,
          refinedData.ram ? `${refinedData.ram} RAM` : null,
          refinedData.screen_size,
          refinedData.size // Pointure ou taille vêtement
        ].filter(Boolean).join(' ');

        const finalTitle = newTitleComponents.length > 5 ? newTitleComponents : basePayload.title;

        // Calculer le prix affiné
        let updatedPrice = detectedPrice;
        if (lastScanResult && lastScanResult.pricing && lastScanResult.pricing.samples) {
            const refinedPrice = recalculatePriceLocal(lastScanResult.pricing.samples, refinedData);
            if (refinedPrice) updatedPrice = refinedPrice;
        }

        // Préparer les specs pour la description
        let techDetails = [];
        if (refinedData.condition) techDetails.push(`État : ${refinedData.condition}`);
        if (refinedData.storage) techDetails.push(`Stockage : ${refinedData.storage}`);
        if (refinedData.ram) techDetails.push(`RAM : ${refinedData.ram}`);
        if (refinedData.processor) techDetails.push(`Processeur : ${refinedData.processor}`);
        if (refinedData.gpu) techDetails.push(`GPU : ${refinedData.gpu}`);
        if (refinedData.screen_size) techDetails.push(`Écran : ${refinedData.screen_size}`);
        if (refinedData.size) techDetails.push(`Taille : ${refinedData.size}`);
        if (refinedData.battery_health) techDetails.push(`Batterie : ${refinedData.battery_health}%`);
        if (refinedData.accessories) techDetails.push(`Accessoires : ${refinedData.accessories}`);
        const specsString = techDetails.join(' • ');
        console.log('📋 Specs pour la description:', specsString);

        // Mapper condition raffinée vers usedGrade
        const refinedConditionMap = {
          'neuf': 'like_new', 'new': 'like_new', 'comme_neuf': 'like_new',
          'like_new': 'like_new', 'tres_bon': 'excellent', 'excellent': 'excellent',
          'bon': 'good', 'good': 'good', 'correct': 'fair', 'fair': 'fair',
          'use': 'poor', 'poor': 'poor'
        };
        const refinedUsedGrade = refinedConditionMap[refinedData.condition] || basePayload.usedGrade || 'good';

        // Récupérer la catégorie depuis identificationData ou le scan
        const refinedCategoryId = identificationData?.category || basePayload.categoryId || null;

        const refinedPayload = {
            ...basePayload,
            title: finalTitle,
            priceHint: updatedPrice,
            usedGrade: refinedUsedGrade,
            categoryId: refinedCategoryId,
            specs: refinedData,
            hints: { label: finalTitle, ocrFullText: `Specs: ${JSON.stringify(refinedData)}` }
        };

        // MAINTENANT on lance l'animation et l'appel API
        await executeGenerationWithAnimation(refinedPayload, specsString, finalTitle, updatedPrice);
      });
      return;
    }

    // Pas de formulaire nécessaire, lancer directement
    await executeGenerationWithAnimation(basePayload, null, null, null);
  }

  // Fonction séparée pour l'animation + appel API
  async function executeGenerationWithAnimation(payload, specsString, forcedTitle, forcedPrice) {
    // MAINTENANT on lance l'animation
    setThumbsLoading(true);

    try {
      const endpoint = lastScanResult ? '/api/ai/listing' : '/api/ai/describe';

      // DEBUG: Log complet du payload envoyé à l'API
      console.group('📤 DEBUG REQUÊTE API');
      console.log('Endpoint:', endpoint);
      console.log('Payload complet:', JSON.stringify(payload, null, 2));
      console.log('Specs envoyées:', payload.specs);
      console.groupEnd();

      const json = await apiJSON(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.group('🚨 DEBUG RÉPONSE IA');
      console.log('Réponse complète:', json);
      console.groupEnd();

      // Appliquer les valeurs forcées si présentes
      if (forcedTitle && !json.title) json.title = forcedTitle;
      if (forcedPrice) json.price = forcedPrice;
      if (specsString && json.description && !json.description.includes(payload.specs?.storage || '')) {
          json.description = specsString + ".\n\n" + json.description;
      }

      displayFinalResults(json, payload);
    } catch (e) {
      console.error('❌ Erreur Génération:', e);
      // Gérer erreur quota épuisé
      if (e instanceof QuotaExceededError) {
        showQuotaModal();
        showToast('Quota épuisé', 'warn');
      } else {
        showToast(e.message || 'Erreur lors de la génération', 'error');
      }
      setSendState('ready');
      isBusy = false;
      setThumbsLoading(false);
      // Rafraîchir le quota dans la navbar
      refreshQuota();
    }
  }

  function displayFinalResults(json, payload) {
      const beforeState = document.getElementById('beforeScanState');
      const afterState = document.getElementById('afterScanState');
      if (beforeState) beforeState.style.display = 'none';
      if (afterState) afterState.style.display = 'block';

      // Afficher la galerie photos (avec image catégorie si text-only)
      renderPhotoGallery(payload.title);

      let finalPrice = null;
      function normalizePrice(value) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') return parsePriceRobust(value);
        return null;
      }
      const priceCandidates = [
        json.price,
        json.roundedPrice,
        json.listing && json.listing.price,
        json.estimated_price,
        lastScanResult && lastScanResult.pricing && lastScanResult.pricing.median,
        payload.priceHint
      ];
      for (const candidate of priceCandidates) {
        const normalized = normalizePrice(candidate);
        if (normalized !== null && normalized > 0) { finalPrice = normalized; break; }
      }

      if (dom.priceText) {
        if (finalPrice !== null) {
          dom.priceText.textContent = `${finalPrice} ${payload.currency}`;
          dom.priceText.classList.remove('text-gray-400');
        } else {
          dom.priceText.textContent = 'N/A';
        }
      }

      const finalDesc = json.description || (json.listing ? json.listing.description : '') || '';
      if (dom.descText) dom.descText.textContent = finalDesc || 'Pas de description générée.';
      const finalTitle = json.title || (json.listing ? json.listing.title : '') || payload.title || 'Sans titre';
      if (dom.titleText) dom.titleText.textContent = finalTitle;
      setupClickToCopy('resTitleBox', finalTitle);
      setupClickToCopy('resPriceBox', finalPrice !== null ? finalPrice : '');
      setupClickToCopy('resDescBox', finalDesc);
      
      // --- SAUVEGARDE HISTORIQUE ---
      try {
        const saveToHistory = (thumb) => {
          const histKey = 'flipiq.history.v1';
          const currentHist = JSON.parse(localStorage.getItem(histKey) || '[]');
          currentHist.unshift({
            title: finalTitle,
            price: finalPrice,
            currency: payload.currency,
            description: finalDesc,
            image: thumb || null,
            imageCount: currentPhotos.length || 0,
            date: new Date().toISOString()
          });
          localStorage.setItem(histKey, JSON.stringify(currentHist.slice(0, 50)));
          window.dispatchEvent(new CustomEvent('flipiq:history-updated'));
        };

        if (currentPhotos.length > 0) {
          fileToThumbnail(currentPhotos[0]).then(saveToHistory).catch(() => saveToHistory(null));
        } else {
          // Text-only generation: save without image
          saveToHistory(null);
        }
      } catch (e) { console.error(e); }

      setSendState('complete');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      isBusy = false;
      setThumbsLoading(false);

      // Rafraîchir le quota dans la navbar après génération réussie
      refreshQuota();

      // 📤 Dispatch event pour scan-sell (boutons Vinted/LBC)
      window.dispatchEvent(new CustomEvent('flipiq:listing-ready', {
        detail: {
          price: finalPrice,
          priceLabel: finalPrice ? `${finalPrice} ${payload.currency}` : null,
          description: finalDesc,
          photos: currentPhotos // Transmettre toutes les photos
        }
      }));
  }

  function setupClickToCopy(elementId, textToCopy) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const newEl = el.cloneNode(true);
    el.parentNode.replaceChild(newEl, el);
    newEl.addEventListener('click', () => {
      if (!textToCopy) return;
      navigator.clipboard.writeText(textToCopy).then(() => {
        showToast('Copié !', 'success');
        // Animation avec couleur #2596be
        newEl.classList.add('is-copied');
        setTimeout(() => newEl.classList.remove('is-copied'), 600);
      });
    });
  }

  // --- Galerie Photos ---
  function renderPhotoGallery(titleForCategory) {
    const gallery = document.getElementById('photoGallery');
    const galleryScroll = document.getElementById('galleryScroll');
    if (!gallery || !galleryScroll) return;

    // Si pas de photos, afficher l'image de catégorie basée sur le titre
    if (currentPhotos.length === 0) {
      const categoryImg = getCategoryImage(titleForCategory || dom.searchInput?.value || '');
      galleryScroll.innerHTML = `
        <div class="gallery-item gallery-item-category">
          <img src="${categoryImg}" alt="Catégorie" />
        </div>
      `;
      gallery.style.display = 'block';
      return;
    }

    galleryScroll.innerHTML = '';
    currentPhotos.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `<img src="${url}" alt="Photo ${index + 1}" />`;
      item.addEventListener('click', () => openLightbox(url));
      galleryScroll.appendChild(item);
    });
    gallery.style.display = 'block';
  }

  // --- Lightbox ---
  function openLightbox(imageUrl) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImage');
    if (!modal || !img) return;
    img.src = imageUrl;
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    if (modal) modal.setAttribute('aria-hidden', 'true');
  }

  // Lightbox event listeners
  const lightboxModal = document.getElementById('lightboxModal');
  const lightboxBackdrop = document.querySelector('.lightbox-backdrop');
  const lightboxClose = document.querySelector('.lightbox-close');

  if (lightboxBackdrop) lightboxBackdrop.addEventListener('click', closeLightbox);
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightboxModal) {
    lightboxModal.addEventListener('click', (e) => {
      if (e.target === lightboxModal) closeLightbox();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
  });

  const backBtn = document.getElementById('backToScan');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      document.getElementById('afterScanState').style.display = 'none';
      document.getElementById('beforeScanState').style.display = 'block';

      // Réinitialiser toutes les données
      userInputData = { condition: null };
      lastScanResult = null;

      // Vider les photos et réinitialiser les thumbnails
      currentPhotos = [];
      photosReady = false;
      renderThumbnails();

      // Vider le champ de recherche
      if (dom.searchInput) {
        dom.searchInput.value = '';
        dom.searchInput.setAttribute('placeholder', 'Search your product');
      }

      // Relancer l'animation placeholder
      if (window.placeholderAnimator) {
        window.placeholderAnimator = { stop: false };
        animate();
      }

      setSendState('ready');
    });
  }

  const PLACEHOLDERS = [
    'Iphone 13 noir 128go', 'Nike Air Max 90', "Sac Eastpak Padded Pak'r gris"
  ];
  window.placeholderAnimator = { stop: false };
  async function animate() {
    if (!dom.searchInput) return;
    const sleep = (m) => new Promise((r) => setTimeout(r, m));
    for (let i = 0; !window.placeholderAnimator.stop; i = (i + 1) % PLACEHOLDERS.length) {
      const txt = PLACEHOLDERS[i];
      for (let j = 0; j <= txt.length; j++) {
        if (window.placeholderAnimator.stop) {
          dom.searchInput.setAttribute('placeholder', 'Search your product');
          return;
        }
        dom.searchInput.setAttribute('placeholder', txt.slice(0, j) + '|');
        await sleep(80);
      }
      await sleep(1500);
    }
  }
  animate();

  // --- Section Historique sous upload ---
  // Fonction pour obtenir l'image de catégorie selon le titre du produit
  function getCategoryImage(text) {
    if (!text) return '/img/Boxemoji.webp';
    const t = text.toLowerCase();

    // Console / Gaming
    if (/playstation|ps5|ps4|ps3|xbox|switch|nintendo|console|gaming|manette/.test(t)) {
      return '/img/Consoleemoji.webp';
    }
    // Téléphone / Smartphone
    if (/phone|iphone|samsung|smartphone|mobile|galaxy|pixel|oneplus|xiaomi|huawei|téléphone|telephone/.test(t)) {
      return '/img/Phoneemoji.webp';
    }
    // Laptop / Ordinateur
    if (/laptop|ordinateur portable|ordinateur|macbook|pc portable|notebook|chromebook|imac|pc|tablette|ipad/.test(t)) {
      return '/img/laptopemoji.webp';
    }
    // Casque / Audio
    if (/casque|écouteurs|ecouteurs|headphone|airpods|earbuds|audio|enceinte|speaker/.test(t)) {
      return '/img/headphoneemoji.webp';
    }
    // Pantalon
    if (/pantalon|jean|jeans|jogging|short|pants|legging/.test(t)) {
      return '/img/Pantsemoji.webp';
    }
    // Chaussures
    if (/chaussure|sneaker|basket|shoe|nike|adidas|puma|reebok|botte|jordan|new balance|converse|vans/.test(t)) {
      return '/img/shoeemoji.webp';
    }
    // T-shirt / Hauts
    if (/t-shirt|tshirt|polo|chemise|haut|top|maillot|pull|sweat|hoodie|veste|jacket|manteau/.test(t)) {
      return '/img/tshirtemoji.webp';
    }
    // Sac
    if (/sac|bag|sac à main|sac à dos|backpack|valise|sacoche|eastpak/.test(t)) {
      return '/img/bagemoji.webp';
    }
    // Chapeau
    if (/chapeau|casquette|bonnet|hat|cap|béret/.test(t)) {
      return '/img/hatemoji.webp';
    }

    // Défaut
    return '/img/Boxemoji.webp';
  }

  function renderScanHistory() {
    const grid = document.getElementById('scanHistoryGrid');
    const empty = document.getElementById('scanHistoryEmpty');
    const section = document.getElementById('scanHistorySection');
    if (!grid || !section) return;

    const histKey = 'flipiq.history.v1';
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(histKey) || '[]');
    } catch (e) {
      items = [];
    }

    // Afficher seulement les 6 dernières annonces
    const recentItems = items.slice(0, 6);

    if (recentItems.length === 0) {
      grid.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    if (empty) empty.style.display = 'none';

    grid.innerHTML = recentItems.map((item, idx) => {
      const categoryImage = getCategoryImage(item.title);
      // Si l'item a une image (base64), l'utiliser, sinon utiliser l'image de catégorie
      const hasRealImage = item.image && item.image.length > 50;
      const thumbSrc = hasRealImage ? item.image : categoryImage;

      const price = item.price ? `${item.price} ${item.currency || 'EUR'}` : '';

      // Debug: utiliser background-image au lieu de img pour les images base64
      // car les img avec data URL peuvent avoir des problèmes de rendu
      const bgStyle = `background-image:url('${thumbSrc}');background-size:cover;background-position:center;`;

      return `
        <div class="scan-history-item" data-idx="${idx}">
          <div class="scan-history-thumb-wrapper" style="${bgStyle}">
          </div>
          <div class="scan-history-info">
            <p class="scan-history-item-title">${item.title || 'Sans titre'}</p>
            ${price ? `<p class="scan-history-item-price">${price}</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Click pour afficher l'annonce
    grid.querySelectorAll('.scan-history-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        const item = recentItems[idx];
        if (!item) return;

        // Afficher directement le résultat sur cette page
        displayPreloadedResult({
          title: item.title || '',
          price: item.price ?? null,
          currency: item.currency || 'EUR',
          description: item.description || '',
          image: item.image || null,
          showResult: true
        });
      });
    });
  }

  // Render on load
  renderScanHistory();

  // Update when history changes
  window.addEventListener('flipiq:history-updated', renderScanHistory);
})();
