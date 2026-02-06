# Configuration Stripe pour FlipIQ

## Vue d'ensemble

FlipIQ utilise Stripe Checkout pour les paiements. Le flux est le suivant :

1. **L'utilisateur clique sur "Passer en Premium"** sur `/premium.php`
2. **Le frontend appelle** `POST /api/payments/checkout` avec `{ provider: "stripe", plan: "premium" }`
3. **Le backend crée une Checkout Session** et retourne l'URL Stripe
4. **L'utilisateur est redirigé vers Stripe** pour payer
5. **Après paiement, Stripe redirige vers** `/premium-return.php?status=success&plan=premium`
6. **Stripe envoie un webhook** à `/api/payments/stripe/webhook`
7. **Le backend active le plan Premium** pour l'utilisateur

## Variables d'environnement (Railway)

Configurez ces variables dans Railway :

```bash
# OBLIGATOIRE
STRIPE_SECRET_KEY=<votre_cle_secrete_stripe>
STRIPE_WEBHOOK_SECRET=<votre_secret_webhook>
STRIPE_PRICE_PREMIUM=<votre_price_id_premium>

# OPTIONNEL (si plan Pro)
STRIPE_PRICE_PRO=<votre_price_id_pro>
```

## Configuration Stripe Dashboard

### 1. Créer un Product et Price

1. Aller sur [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Cliquer sur **"+ Add product"**
3. Remplir :
   - Name: `FlipIQ Premium`
   - Price: `4.99 EUR` (one-time payment)
4. Copier le **Price ID** (commence par `price_`)
5. Le mettre dans `STRIPE_PRICE_PREMIUM` sur Railway

### 2. Configurer le Webhook

1. Aller sur [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Cliquer sur **"+ Add endpoint"**
3. Remplir :
   - **Endpoint URL:** `https://api.flipiqapp.com/api/payments/stripe/webhook`
   - **Events to send:** `checkout.session.completed`
4. Cliquer sur **"Add endpoint"**
5. Copier le **Signing secret** (commence par `whsec_`)
6. Le mettre dans `STRIPE_WEBHOOK_SECRET` sur Railway

### 3. Récupérer les clés API

1. Aller sur [Stripe Dashboard > API Keys](https://dashboard.stripe.com/apikeys)
2. Copier la **Secret key** (commence par `sk_live_` ou `sk_test_`)
3. La mettre dans `STRIPE_SECRET_KEY` sur Railway

## Tester en Local

### Avec Stripe CLI

1. Installer Stripe CLI :
   ```bash
   # macOS
   brew install stripe/stripe-cli/stripe

   # Windows (Scoop)
   scoop install stripe
   ```

2. Se connecter :
   ```bash
   stripe login
   ```

3. Démarrer le forwarding vers localhost :
   ```bash
   stripe listen --forward-to localhost:5000/api/payments/stripe/webhook
   ```

   Cela affiche un webhook secret temporaire à utiliser en local.

4. Dans un autre terminal, démarrer le backend :
   ```bash
   cd backend
   # Créer .env avec les variables (utiliser sk_test_xxx en local)
   npm run dev
   ```

5. Tester un paiement :
   - Aller sur `http://localhost/Site/premium.php`
   - Cliquer sur "Passer en Premium"
   - Utiliser la carte de test : `4242 4242 4242 4242`

### Cartes de Test Stripe

| Numéro | Description |
|--------|-------------|
| `4242 4242 4242 4242` | Succès |
| `4000 0000 0000 0002` | Refusée |
| `4000 0000 0000 3220` | 3D Secure requis |

Utilisez n'importe quelle date future et CVC.

## Vérifier que tout fonctionne

### 1. Vérifier le webhook

Dans les logs Railway, vous devriez voir :
```
[TEST] User xxxxx upgraded to premium
```

### 2. Vérifier dans Stripe Dashboard

Aller sur [Stripe Dashboard > Events](https://dashboard.stripe.com/events) pour voir :
- `checkout.session.completed` ✓

### 3. Vérifier l'utilisateur

L'utilisateur devrait maintenant avoir :
- `plan: "premium"`
- `isPremium: true`

## Dépannage

### Le webhook ne reçoit rien

1. Vérifier que l'URL est correcte : `https://api.flipiqapp.com/api/payments/stripe/webhook`
2. Vérifier que le serveur répond (pas de 502/503)
3. Regarder les logs Railway

### Erreur de signature webhook

```
Webhook Signature Error: No signatures found matching the expected signature
```

**Cause :** Le `STRIPE_WEBHOOK_SECRET` ne correspond pas.

**Solution :** Régénérer le webhook dans Stripe Dashboard et mettre à jour la variable.

### Le plan n'est pas activé

1. Vérifier que le `client_reference_id` contient bien l'ID utilisateur
2. Vérifier les logs pour `activatePlan()`
3. Vérifier la connexion MongoDB

## Architecture des fichiers

```
backend/
├── src/
│   ├── app.js                    # Monte le webhook avec express.raw()
│   ├── routes/
│   │   ├── payments.js           # POST /checkout, webhook handler
│   │   └── plans.js              # GET /me, POST /select
│   └── models/
│       └── user.js               # Schéma utilisateur avec plan/isPremium
│
Site/
├── premium.php                   # Page de sélection du plan
├── premium-return.php            # Page de retour après paiement
└── js/
    └── premium.js                # Logique frontend pour checkout
```

## Sécurité

- ❌ **NE JAMAIS** mettre `STRIPE_SECRET_KEY` dans le code source
- ❌ **NE JAMAIS** faire confiance au montant envoyé par le client
- ✅ Toujours utiliser les Price IDs côté serveur
- ✅ Toujours vérifier la signature du webhook en production
- ✅ Utiliser `client_reference_id` pour identifier l'utilisateur
