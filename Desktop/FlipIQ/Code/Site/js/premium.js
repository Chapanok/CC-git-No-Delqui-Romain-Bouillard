/**
 * FlipIQ - Premium Page JavaScript
 * Handles plan selection, payment modal, and checkout flow
 */

(function() {
  'use strict';

  // State
  let selectedPlan = null;
  let selectedPayment = 'stripe';

  // Initialize
  function init() {
    setupPlanButtons();
    setupModal();
    setupPaymentMethods();
  }

  // Plan Selection
  function setupPlanButtons() {
    const planButtons = document.querySelectorAll('[data-plan]');

    planButtons.forEach(button => {
      button.addEventListener('click', () => {
        const plan = button.getAttribute('data-plan');
        selectedPlan = plan;
        openPaymentModal(plan);
      });
    });
  }

  // Modal Management
  function setupModal() {
    const modal = document.getElementById('paymentModal');
    const overlay = document.getElementById('modalOverlay');
    const closeBtn = document.getElementById('modalClose');
    const cancelBtn = document.getElementById('cancelPayment');
    const confirmBtn = document.getElementById('confirmPayment');

    // Close modal handlers
    [overlay, closeBtn, cancelBtn].forEach(el => {
      if (el) {
        el.addEventListener('click', closePaymentModal);
      }
    });

    // Confirm payment
    if (confirmBtn) {
      confirmBtn.addEventListener('click', handlePayment);
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
        closePaymentModal();
      }
    });
  }

  // Payment Methods
  function setupPaymentMethods() {
    const paymentOptions = document.querySelectorAll('.payment-option input[type="radio"]');

    paymentOptions.forEach(option => {
      option.addEventListener('change', (e) => {
        selectedPayment = e.target.value;
        console.log('Payment method selected:', selectedPayment);
      });
    });
  }

  // Open Payment Modal
  function openPaymentModal(plan) {
    const modal = document.getElementById('paymentModal');
    const planText = document.getElementById('selectedPlan');

    if (!modal) return;

    // Update plan info
    const planInfo = getPlanInfo(plan);
    if (planText) {
      planText.textContent = `${planInfo.name} - ${planInfo.price} €/mois`;
    }

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Add animation
    setTimeout(() => {
      const content = modal.querySelector('.modal-content');
      if (content) {
        content.style.animation = 'modalSlideIn 0.3s ease';
      }
    }, 10);
  }

  // Close Payment Modal
  function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (!modal) return;

    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Handle Payment - PRODUCTION MODE avec Stripe Checkout
  async function handlePayment() {
    if (!selectedPlan) {
      showToast('Veuillez sélectionner un plan', 'error');
      return;
    }

    console.log('Processing payment...', {
      plan: selectedPlan,
      paymentMethod: selectedPayment
    });

    // Disable button and show loading
    const confirmBtn = document.getElementById('confirmPayment');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Redirection...';
    }

    showToast('Redirection vers le paiement...', 'default');

    try {
      const token = localStorage.getItem('flipiq_token');
      const API_BASE = (window.API_BASE || 'https://api.flipiqapp.com').replace(/\/$/, '');

      // Appeler l'API de checkout qui retourne l'URL Stripe/PayPal
      const response = await fetch(`${API_BASE}/api/payments/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          provider: selectedPayment, // 'stripe', 'paypal', ou 'paysafecard'
          plan: selectedPlan         // 'premium' ou 'pro'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Erreur lors de la création du paiement');
      }

      // Rediriger vers la page de paiement (Stripe Checkout, PayPal, etc.)
      if (data.url) {
        window.location.href = data.url;
      } else if (data.psc_payment_id) {
        // Paysafecard: stocker l'ID pour vérifier le statut après
        sessionStorage.setItem('psc_payment_id', data.psc_payment_id);
        sessionStorage.setItem('psc_plan', selectedPlan);
        if (data.url) window.location.href = data.url;
      } else {
        throw new Error('URL de paiement non reçue');
      }

    } catch (error) {
      console.error('Payment error:', error);
      showToast('Erreur: ' + error.message, 'error');

      // Re-enable button
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Payer';
      }
    }
  }

  // Get Plan Info
  function getPlanInfo(plan) {
    const plans = {
      premium: {
        name: 'Premium',
        price: '4,99'
      }
    };

    return plans[plan] || plans.premium;
  }

  // Show Toast
  function showToast(message, type = 'default') {
    const toast = document.createElement('div');
    toast.className = 'premium-toast';
    toast.textContent = message;

    let bgColor = '#1F2937';
    if (type === 'success') bgColor = '#10b981';
    if (type === 'error') bgColor = '#ef4444';
    if (type === 'warning') bgColor = '#f59e0b';

    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: ${bgColor};
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      z-index: 10001;
      animation: slideIn 0.3s ease;
      font-family: var(--font-sans);
      font-size: 14px;
      font-weight: 500;
      max-width: 400px;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
