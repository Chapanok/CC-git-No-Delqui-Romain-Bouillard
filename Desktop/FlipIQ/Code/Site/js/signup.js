// js/signup.js
import { apiFetch } from './api.js';
import { auth } from './firebase-init.js';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';

const form = document.getElementById('signupForm');
const msg = document.getElementById('signupMsg');

function setMsg(type, text) {
  if (!msg) return;
  // Vert pour succès, Gris pour info, Rouge pour erreur
  msg.style.color = type === 'ok' ? '#10b981' : (type === 'info' ? '#6b7280' : '#ef4444');
  msg.textContent = text;
  msg.style.display = 'block';
}

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg('info', 'Création du compte en cours...');

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const name = document.getElementById('name')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;

    try {
      // === ÉTAPE 1 : CRÉER LE COMPTE MONGODB (source de vérité) ===
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });

      setMsg('info', 'Compte créé ! Envoi de l\'email de vérification...');

      // === ÉTAPE 2 : CRÉER LE COMPTE FIREBASE (pour l'email de vérification uniquement) ===
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);

        // === ÉTAPE 3 : ENVOYER L'EMAIL DE VÉRIFICATION ===
        const actionCodeSettings = {
          url: `${location.origin}/login.php?verified=1`,
          handleCodeInApp: false,
        };

        await sendEmailVerification(cred.user, actionCodeSettings);

        // === ÉTAPE 4 : DÉCONNECTER DE FIREBASE (on n'a plus besoin de la session) ===
        await signOut(auth);

        setMsg('ok', '✅ Inscription réussie ! Un email de vérification a été envoyé à ' + email);

        // Réinitialiser le formulaire
        form.reset();

        // Redirection vers login après 3 secondes
        setTimeout(() => {
          window.location.href = 'login.php?from=signup';
        }, 3000);

      } catch (firebaseErr) {
        console.error('Erreur Firebase:', firebaseErr);

        // Si l'email existe déjà dans Firebase, c'est OK (on a créé le compte MongoDB)
        if (firebaseErr.code === 'auth/email-already-in-use') {
          setMsg('ok', '✅ Compte créé ! Connecte-toi avec tes identifiants.');
          setTimeout(() => {
            window.location.href = 'login.php?from=signup';
          }, 2000);
        } else {
          // Autre erreur Firebase (pas critique, le compte MongoDB existe)
          setMsg('ok', 'Compte créé mais erreur lors de l\'envoi de l\'email. Contacte le support si besoin.');
          setTimeout(() => {
            window.location.href = 'login.php?from=signup';
          }, 3000);
        }
      }

    } catch (err) {
      console.error(err);

      // Gestion des erreurs spécifiques du backend MongoDB
      let errorText = "Une erreur est survenue.";
      if (err.data && err.data.error) {
        if (err.data.error === 'email_deja_utilise') errorText = "Cet email est déjà utilisé.";
        else if (err.data.error === 'email_et_password_requis') errorText = "Email et mot de passe requis.";
        else errorText = err.data.error;
      }

      setMsg('err', errorText);
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
