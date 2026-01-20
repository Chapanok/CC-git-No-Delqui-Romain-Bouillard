// /Site/js/login.js
import { apiFetch } from "./api.js";
import { auth } from "./firebase-init.js";
import {
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const passwordInput = document.getElementById("login-password");
const errorBox = document.getElementById("login-error");

function showError(msg) {
  if (!errorBox) return alert(msg);
  errorBox.style.display = "block";
  errorBox.textContent = msg;
}

function clearError() {
  if (!errorBox) return;
  errorBox.style.display = "none";
  errorBox.textContent = "";
  // Supprimer le bouton "Renvoyer" si existant
  const resendBtn = document.getElementById("resendVerifyBtn");
  if (resendBtn) resendBtn.remove();
}

function setToken(token) {
  localStorage.setItem("flipiq_token", token);
  document.cookie =
    "flip_auth=" + encodeURIComponent(token) + "; path=/; max-age=604800; SameSite=Lax";
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput?.value.trim();
  const password = passwordInput?.value;

  try {
    // === ÉTAPE 1 : CONNEXION FIREBASE (pour vérifier l'email) ===
    const cred = await signInWithEmailAndPassword(auth, email, password);

    // === ÉTAPE 2 : VÉRIFIER SI L'EMAIL EST VÉRIFIÉ DANS FIREBASE ===
    if (!cred.user.emailVerified) {
      showError("⚠️ Email non vérifié. Clique sur \"Renvoyer l'email\" puis vérifie ta boîte mail.");

      // Bouton "Renvoyer l'email" injecté proprement
      if (errorBox && !document.getElementById("resendVerifyBtn")) {
        const btn = document.createElement("button");
        btn.id = "resendVerifyBtn";
        btn.type = "button";
        btn.textContent = "Renvoyer l'email de vérification";
        btn.style.marginTop = "10px";
        btn.style.padding = "8px 16px";
        btn.style.backgroundColor = "#3b82f6";
        btn.style.color = "white";
        btn.style.border = "none";
        btn.style.borderRadius = "4px";
        btn.style.cursor = "pointer";

        btn.addEventListener("click", async () => {
          try {
            await sendEmailVerification(cred.user, {
              url: `${location.origin}/login.php?verified=1`,
            });
            await signOut(auth);
            showError("✅ Email renvoyé ! Vérifie ta boîte mail puis reconnecte-toi.");
          } catch (resendErr) {
            showError("❌ Erreur lors du renvoi : " + (resendErr.message || "inconnue"));
          }
        });

        errorBox.appendChild(document.createElement("br"));
        errorBox.appendChild(btn);
      }

      await signOut(auth);
      return;
    }

    // === ÉTAPE 3 : SYNCHRONISER FIREBASE → MONGODB ===
    // L'email est vérifié dans Firebase, on met à jour MongoDB
    const idToken = await cred.user.getIdToken();

    try {
      await apiFetch("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ idToken }),
      });
      console.log("✅ Email synchronisé avec MongoDB");
    } catch (syncErr) {
      // Si l'erreur est "user_not_found", afficher un message clair
      if (syncErr.data?.error === 'user_not_found') {
        showError("❌ Aucun compte trouvé. Inscris-toi d'abord sur la page d'inscription.");
        await signOut(auth);
        return;
      }
      // Sinon, continuer (la sync n'est pas bloquante)
      console.warn("Avertissement : synchronisation email échouée", syncErr);
    }

    // === ÉTAPE 4 : CONNEXION MONGODB (récupérer le JWT) ===
    const loginResult = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!loginResult?.token) {
      showError("❌ Connexion impossible (token manquant).");
      await signOut(auth);
      return;
    }

    // === ÉTAPE 5 : STOCKER LE TOKEN ET REDIRIGER ===
    setToken(loginResult.token);

    // Déconnecter Firebase (on n'en a plus besoin)
    await signOut(auth);

    // Redirection
    window.location.href = "scan.php";

  } catch (err) {
    const code = err?.code || "";
    const errorMsg = err?.data?.error || "";

    if (code === "auth/invalid-credential") {
      showError("❌ Email ou mot de passe incorrect.");
    } else if (errorMsg === "email_non_verifie") {
      showError("⚠️ Email non vérifié. Vérifie ta boîte mail avant de te connecter.");
    } else if (errorMsg === "credentials_invalides") {
      showError("❌ Email ou mot de passe incorrect.");
    } else {
      showError("❌ Erreur : " + (err?.message || errorMsg || "inconnue"));
    }
  }
});
