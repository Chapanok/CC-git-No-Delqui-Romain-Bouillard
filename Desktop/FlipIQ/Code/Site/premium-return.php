<?php
/**
 * FlipIQ - Page de retour après paiement Stripe/PayPal/Paysafecard
 *
 * Cette page est appelée après un checkout:
 * - ?status=success&plan=premium  -> Paiement réussi
 * - ?status=cancel&plan=premium   -> Paiement annulé
 * - ?status=error                 -> Erreur
 */

$status = isset($_GET['status']) ? htmlspecialchars($_GET['status']) : '';
$plan   = isset($_GET['plan']) ? htmlspecialchars($_GET['plan']) : '';
?>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Paiement - FlipIQ</title>
  <link rel="stylesheet" href="/css/premium.css">
  <link rel="stylesheet" href="/css/responsive-utils.css">
  <style>
    .return-container {
      max-width: 600px;
      margin: 80px auto;
      padding: 40px;
      text-align: center;
    }
    .return-icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    .return-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #1f2937;
    }
    .return-message {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 32px;
      line-height: 1.6;
    }
    .return-btn {
      display: inline-block;
      padding: 14px 32px;
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      color: white;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .return-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 25px rgba(124, 58, 237, 0.3);
    }
    .return-secondary {
      display: block;
      margin-top: 16px;
      color: #6b7280;
      text-decoration: none;
      font-size: 14px;
    }
    .return-secondary:hover {
      color: #7c3aed;
    }
    .success .return-icon { color: #10b981; }
    .cancel .return-icon { color: #f59e0b; }
    .error .return-icon { color: #ef4444; }

    .loading-spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid #e5e7eb;
      border-top-color: #7c3aed;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-left: 8px;
      vertical-align: middle;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <?php include 'header.php'; ?>

  <main class="return-container <?php echo $status; ?>">
    <?php if ($status === 'success'): ?>
      <div class="return-icon">✅</div>
      <h1 class="return-title">Paiement réussi !</h1>
      <p class="return-message">
        Merci pour votre achat ! Votre compte est maintenant
        <strong><?php echo ucfirst($plan ?: 'Premium'); ?></strong>.<br>
        Vous avez accès aux générations illimitées.
        <span id="redirect-msg"><br><br>Redirection automatique dans <span id="countdown">5</span>s...</span>
      </p>
      <a href="/scan" class="return-btn">Créer une annonce</a>
      <a href="/premium" class="return-secondary">Voir mes avantages</a>

    <?php elseif ($status === 'cancel'): ?>
      <div class="return-icon">⚠️</div>
      <h1 class="return-title">Paiement annulé</h1>
      <p class="return-message">
        Vous avez annulé le paiement.<br>
        Aucun montant n'a été débité de votre compte.
      </p>
      <a href="/premium" class="return-btn">Réessayer</a>
      <a href="/scan" class="return-secondary">Retour au scanner</a>

    <?php else: ?>
      <div class="return-icon">❌</div>
      <h1 class="return-title">Une erreur est survenue</h1>
      <p class="return-message">
        Le paiement n'a pas pu être traité.<br>
        Si le problème persiste, contactez notre support.
      </p>
      <a href="/premium" class="return-btn">Réessayer</a>
      <a href="/" class="return-secondary">Retour à l'accueil</a>
    <?php endif; ?>
  </main>

  <?php include 'footer.php'; ?>

  <script>
  (function() {
    const status = '<?php echo $status; ?>';
    const plan = '<?php echo $plan; ?>';

    // Si succès, mettre à jour le compteur navbar et rediriger
    if (status === 'success') {
      // Mettre à jour le compteur immédiatement
      const counterEl = document.getElementById('quotaCounterValue');
      if (counterEl) counterEl.textContent = '∞';

      // Mettre à jour le tooltip
      if (window.updateNavbarQuotaTooltip) {
        window.updateNavbarQuotaTooltip(true, -1);
      }

      // Countdown et redirection
      let countdown = 5;
      const countdownEl = document.getElementById('countdown');
      const interval = setInterval(function() {
        countdown--;
        if (countdownEl) countdownEl.textContent = countdown;
        if (countdown <= 0) {
          clearInterval(interval);
          window.location.href = '/scan?upgrade=success';
        }
      }, 1000);
    }

    // Paysafecard: vérifier le statut si ID en session
    const pscId = sessionStorage.getItem('psc_payment_id');
    const pscPlan = sessionStorage.getItem('psc_plan');

    if (status === 'success' && pscId && pscPlan) {
      (async function() {
        try {
          const API = (window.API_BASE || 'https://api.flipiqapp.com').replace(/\/$/, '');
          const token = localStorage.getItem('flipiq_token');
          const r = await fetch(
            `${API}/api/payments/psc/status?id=${encodeURIComponent(pscId)}&plan=${encodeURIComponent(pscPlan)}`,
            {
              credentials: 'include',
              headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            }
          );
          const d = await r.json();
          console.log('[psc/status]', d);

          // Nettoyer le sessionStorage
          sessionStorage.removeItem('psc_payment_id');
          sessionStorage.removeItem('psc_plan');
        } catch(e) {
          console.error('[psc/status error]', e);
        }
      })();
    }
  })();
  </script>
</body>
</html>
