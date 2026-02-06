<?php
// 1. Session start doit être LA PREMIÈRE instruction, sans aucune ligne vide avant <?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// 2. Header UTF-8 pour éviter les problèmes d'encodage des accents
if (!headers_sent()) {
    header('Content-Type: text/html; charset=UTF-8');
}

// 3. Ensuite les configs et erreurs
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Inclusion de la config
if (file_exists(__DIR__ . '/config/api.php')) {
    require_once __DIR__ . '/config/api.php';
}

/* ---- CONFIGURATION ---- */
$apiBaseUrl = defined('API_BASE') ? API_BASE : 'https://api.flipiqapp.com';
$COOKIE_NAME = 'flip_auth';

/* ---- LOGIQUE DE CONNEXION AUTO (Via Cookie) ---- */
if (empty($_SESSION['user']) && !empty($_COOKIE[$COOKIE_NAME])) {
  
  $token = $_COOKIE[$COOKIE_NAME];
  
  $ch = curl_init(rtrim($apiBaseUrl, '/') . '/api/auth/me');
  
  curl_setopt_array($ch, [
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 4,
    CURLOPT_HTTPHEADER     => [
        "Content-Type: application/json",
        "Accept: application/json",
        "Authorization: Bearer " . $token
    ],
  ]);

  $rawResponse = curl_exec($ch);
  $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($httpCode === 200 && $rawResponse) {
    $data = json_decode($rawResponse, true);
    $user = $data['user'] ?? $data;

    if (!empty($user) && !empty($user['email'])) {
      $_SESSION['user']  = $user;
      $_SESSION['token'] = $token;
    }
  } 
}

/* ---- DONNÉES D'AFFICHAGE ---- */
$isLogged = !empty($_SESSION['user']);
$userData = $_SESSION['user'] ?? [];
$displayName = $userData['name'] ?? $userData['email'] ?? 'Utilisateur';
$initial = strtoupper(substr($displayName, 0, 1));

/* ---- RÉCUPÉRATION DU PLAN ET QUOTA (Pour la navbar) ---- */
$userPlan = 'free';
$remainingGenerations = 3;
$isPremium = false;

if ($isLogged && !empty($_COOKIE[$COOKIE_NAME])) {
    $token = $_COOKIE[$COOKIE_NAME];
    $chPlan = curl_init(rtrim($apiBaseUrl, '/') . '/api/plans/me');
    curl_setopt_array($chPlan, [
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 3,
        CURLOPT_HTTPHEADER     => [
            "Content-Type: application/json",
            "Accept: application/json",
            "Authorization: Bearer " . $token
        ],
    ]);
    $planResponse = curl_exec($chPlan);
    $planHttpCode = curl_getinfo($chPlan, CURLINFO_HTTP_CODE);
    curl_close($chPlan);

    if ($planHttpCode === 200 && $planResponse) {
        $planData = json_decode($planResponse, true);
        if ($planData) {
            $userPlan = $planData['plan'] ?? 'free';
            $isPremium = $planData['isPremium'] ?? ($userPlan === 'premium');
            $remainingGenerations = $planData['remainingGenerations'] ?? 3;
        }
    }
}

// Pour affichage: ∞ si premium, sinon le nombre restant
$quotaDisplay = $isPremium ? '∞' : $remainingGenerations;
?>

<!-- Favicon -->
<link rel="icon" type="image/png" href="/img/icone.png">
<link rel="apple-touch-icon" href="/img/icone.png">

<link rel="stylesheet" href="/css/navbar.css?v=20251212">
<link rel="stylesheet" href="/css/responsive-utils.css?v=20251212">

<script>
  (function () {
    var phpBase = <?php echo json_encode($apiBaseUrl); ?>;
    window.API_BASE = (window.API_BASE || phpBase).replace(/\/$/, '');

    var origFetch = window.fetch;
    window.fetch = function (resource, init) {
        var url = (typeof resource === 'string') ? resource : (resource.url || '');
        if (url.includes('/api/')) {
            if (url.startsWith('/')) url = window.API_BASE + url;
            init = init || {};
            init.credentials = 'include';
            
            var localToken = localStorage.getItem('flipiq_token');
            if (localToken) {
                init.headers = init.headers || {};
                if (init.headers instanceof Headers) {
                    init.headers.set('Authorization', 'Bearer ' + localToken);
                } else {
                    init.headers['Authorization'] = 'Bearer ' + localToken;
                }
            }
            if (typeof resource === 'string') resource = url;
            else resource = new Request(url, init);
        }
        return origFetch(resource, init);
    };

    function addOffset() {
      if (document.body) document.body.classList.add('navbar-offset');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addOffset);
    else addOffset();
  })();
</script>

<script src="/js/i18n.js" defer></script>
<script src="https://unpkg.com/lucide@latest" defer></script>


<head>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8171091030080011"
     crossorigin="anonymous"></script>
</head>
<nav class="navbar">
  <div class="navbar-container">
    <a href="/" class="navbar-logo" aria-label="Accueil">
      <img src="/img/logo.png" class="icone-header logo-light" alt="FlipIQ" width="120" height="38" loading="eager">
      <img src="/img/favicon.png" class="icone-header logo-dark" alt="FlipIQ" width="38" height="38" loading="eager" style="display: none;">
    </a>

    <!-- Bande centrale avec badges stores (visible sur page d'accueil) -->
    <div class="navbar-stores" id="navbarStores">
      <span class="navbar-stores-text">Téléchargez-le sur mobile!</span>
      <div class="navbar-stores-badges">
        <a href="#" class="navbar-store-badge" aria-label="Download on Google Play">
          <img src="/img/img8.png" alt="Get it on Google Play" height="32">
        </a>
        <a href="#" class="navbar-store-badge" aria-label="Download on App Store">
          <img src="/img/img9.png" alt="Download on the App Store" height="32">
        </a>
      </div>
    </div>

    <div class="navbar-actions" id="navbarActions">
      <?php if ($isLogged): ?>
        <a href="/scan" class="btn btn-new-ad">
          <i data-lucide="plus-circle"></i>
          <span data-i18n="nav.newListing">New Listing</span>
        </a>
        <a href="/premium" class="navbar-counter" id="navbarQuotaCounter" data-user-plan="<?php echo htmlspecialchars($userPlan); ?>" data-premium="<?php echo $isPremium ? '1' : '0'; ?>">
          <i data-lucide="zap"></i>
          <span class="counter-value" id="quotaCounterValue"><?php echo htmlspecialchars($quotaDisplay); ?></span>
          <!-- Tooltip au survol -->
          <div class="navbar-quota-tooltip" id="navbarQuotaTooltip">
            <div class="navbar-quota-tooltip-arrow"></div>
            <div class="navbar-quota-tooltip-content" id="navbarQuotaTooltipContent">
              <!-- Contenu injecté par JS -->
            </div>
          </div>
        </a>
        <div class="user-menu" id="userMenu">
          <button class="user-avatar" id="userMenuBtn" aria-expanded="false">
            <span class="avatar-letter"><?php echo htmlspecialchars($initial); ?></span>
            <i data-lucide="chevron-down" class="chevron-icon"></i>
          </button>
          <div class="user-dropdown" id="userDropdown">
            <div class="dropdown-header"><strong><?php echo htmlspecialchars($displayName); ?></strong></div>
            <a href="/profil" class="dropdown-item"><i data-lucide="user"></i><span data-i18n="nav.settings">Settings</span></a>
            <a href="/premium" class="dropdown-item"><i data-lucide="crown"></i><span data-i18n="nav.premium">Premium</span></a>
            <hr class="dropdown-divider">
            <a href="/logout" class="dropdown-item logout"><i data-lucide="log-out"></i><span data-i18n="nav.logout">Log out</span></a>
          </div>
        </div>
      <?php else: ?>
        <a class="btn btn-login" href="/login" data-i18n="auth.login">Login</a>
        <a class="btn btn-signup" href="/signup" data-i18n="auth.signup">Sign up</a>
      <?php endif; ?>
    </div>
  </div>
</nav>

<nav class="bottom-nav" aria-label="Navigation principale mobile">
  <?php if ($isLogged): ?>
    <a class="bottom-nav__item" href="/my-listings" data-i18n-aria="nav.myListings" aria-label="My Listings">
      <i data-lucide="list"></i>
      <span data-i18n="nav.myListings">My Listings</span>
    </a>
    <a class="bottom-nav__item bottom-nav__item--center" href="/scan" data-i18n-aria="nav.generateListing" aria-label="Generate Listing">
      <span class="bottom-nav__fab" aria-hidden="true">
        <i data-lucide="plus"></i>
      </span>
      <span class="bottom-nav__label" data-i18n="nav.generateListing">Generate Listing</span>
    </a>
    <a class="bottom-nav__item" href="/profil" data-i18n-aria="nav.profile" aria-label="Profile">
      <i data-lucide="user"></i>
      <span data-i18n="nav.profile">Profile</span>
    </a>
  <?php else: ?>
    <a class="bottom-nav__item" href="/" data-i18n-aria="nav.home" aria-label="Home">
      <i data-lucide="home"></i>
      <span data-i18n="nav.home">Home</span>
    </a>
    <a class="bottom-nav__item bottom-nav__item--center" href="/login" data-i18n-aria="auth.login" aria-label="Login">
      <span class="bottom-nav__fab" aria-hidden="true">
        <i data-lucide="log-in"></i>
      </span>
      <span class="bottom-nav__label" data-i18n="auth.login">Login</span>
    </a>
    <a class="bottom-nav__item" href="/signup" data-i18n-aria="auth.signup" aria-label="Sign up">
      <i data-lucide="user-plus"></i>
      <span data-i18n="auth.signup">Sign up</span>
    </a>
  <?php endif; ?>
</nav>




<script type="module">
  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyBhCcIPf2B97S2ds5Wecn0bNkBlbMDKymI",
    authDomain: "flipiq-b9dae.firebaseapp.com",
    projectId: "flipiq-b9dae",
    storageBucket: "flipiq-b9dae.firebasestorage.app",
    messagingSenderId: "617750498994",
    appId: "1:617750498994:web:83ef2eb66433772ac483ab",
    measurementId: "G-VMS2B8DCCS"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
</script>


<script>
  window.addEventListener('DOMContentLoaded', function () {
    if (window.lucide) window.lucide.createIcons();
    const menuBtn = document.getElementById('userMenuBtn');
    const dropdown = document.getElementById('userDropdown');
    if (menuBtn && dropdown) {
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
        document.addEventListener('click', () => dropdown.classList.remove('active'));
    }

    // Initialiser le tooltip du compteur quota
    updateNavbarQuotaTooltip(
      <?php echo $isPremium ? 'true' : 'false'; ?>,
      <?php echo (int)$remainingGenerations; ?>
    );
  });

  // Fonction globale pour mettre à jour le tooltip du quota navbar
  window.updateNavbarQuotaTooltip = function(isPremium, remaining) {
    const tooltipContent = document.getElementById('navbarQuotaTooltipContent');
    const counter = document.getElementById('navbarQuotaCounter');
    const i18n = window.FlipIQ_i18n || { t: (k) => k };

    if (!tooltipContent) return;

    // Mettre à jour l'attribut data-premium
    if (counter) {
      counter.setAttribute('data-premium', isPremium ? '1' : '0');
    }

    if (isPremium) {
      tooltipContent.innerHTML = `
        <p class="quota-tooltip-title">${i18n.t('quotaModal.congratulations')}</p>
        <p class="quota-tooltip-text">${i18n.t('quotaModal.premiumText')}<br>${i18n.t('quotaModal.unlimited')}</p>
      `;
    } else {
      const plural = remaining > 1 ? i18n.t('quotaModal.plural') : '';
      tooltipContent.innerHTML = `
        <p class="quota-tooltip-title">${i18n.t('quotaModal.freePlan')}</p>
        <p class="quota-tooltip-text">Il vous reste <strong>${remaining}</strong> génération${plural} aujourd'hui.</p>
        <span class="quota-tooltip-upgrade">${i18n.t('quotaModal.upgrade')}</span>
      `;
    }
  };

  // Fonction globale pour recharger le header après connexion
  window.reloadHeader = async function() {
    try {
      // Recharger complètement la page pour que le header PHP soit régénéré
      window.location.reload();
    } catch (e) {
      console.error('Erreur rechargement header:', e);
    }
  };

  // Theme initialization and logo switching
  (function() {
    const THEME_KEY = 'flipiq_theme';

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.classList.toggle('dark-mode', theme === 'dark');

      // Switch logo
      const logoLight = document.querySelector('.logo-light');
      const logoDark = document.querySelector('.logo-dark');

      if (logoLight && logoDark) {
        if (theme === 'dark') {
          logoLight.style.display = 'none';
          logoDark.style.display = 'block';
        } else {
          logoLight.style.display = 'block';
          logoDark.style.display = 'none';
        }
      }
    }

    // Apply saved theme on load
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    applyTheme(savedTheme);

    // Listen for theme changes from other pages (like profile)
    window.addEventListener('flipiq:theme-changed', (e) => {
      applyTheme(e.detail.theme);
    });

    // Re-apply on DOMContentLoaded to ensure logos are available
    document.addEventListener('DOMContentLoaded', () => {
      applyTheme(localStorage.getItem(THEME_KEY) || 'light');
    });
  })();
</script>


<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4585835309168449"
     crossorigin="anonymous"></script>
