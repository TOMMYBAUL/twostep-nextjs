# Phase B — Google Local Inventory : Design

> **Statut** : Design validé par Thomas, prêt pour plan d'implémentation
> **Date** : 2026-03-31
> **Dépend de** : Phase A (enrichissement EAN) — mergé ✅

## Contexte

Two-Step sync les catalogues marchands depuis leurs POS. Les produits enrichis (Phase A) ont un GTIN/EAN, un canonical_name, une photo détourée et un stock temps réel. Google Local Inventory Ads (LIA) et Free Local Listings permettent d'afficher ces produits sur Google Shopping/Maps quand un consommateur cherche un produit à proximité. LIA est actif en France (47+ pays) mais aucun partenaire Local Feeds Partnership français n'existe — opportunité first-mover.

## Décisions de design

| Décision | Choix | Raison |
|---|---|---|
| Voie d'accès Google | **Voie A individuelle** (OAuth par marchand) | Opérationnel dès le 1er marchand, pas besoin d'attendre l'approbation LFP |
| Onboarding marchand | **OAuth Google Merchant Center** | Cohérent avec le pattern POS existant, pas de saisie manuelle |
| Product feed | **Cron quotidien** | Les infos produit (nom, prix, photo) changent rarement |
| Inventory feed | **Temps réel post-sync/webhook** | Le stock change souvent, c'est ce qui compte pour Google |
| Dashboard | **Minimaliste** (statut + compteur) | MVP suffisant, objectif futur = dashboard complet avec métriques |
| API Google | **Merchant API** (pas Content API) | Content API sera arrêté le 18 août 2026 |

## Architecture

```
Sync POS (existant)
  └─ Produits + Stock en base Supabase (existant)
       │
       ├─ Cron quotidien /api/cron/google-feed
       │    └─ Product Feed → Google Merchant API (products.insert)
       │
       └─ Post-sync + webhooks
            └─ Inventory Feed → Google Merchant API (localInventory.insert)

Dashboard marchand
  └─ Onglet "Google"
       ├─ Statut connexion + compteur produits poussés
       └─ Bouton "Connecter à Google" → OAuth Google Merchant Center
```

## Deux voies parallèles (implémentation vs futur)

| | Voie A (implémentée) | Voie B (futur, après LFP) |
|---|---|---|
| Compte Merchant Center | Celui du marchand | Notre MCA Two-Step |
| Auth | OAuth par marchand | API LFP directe |
| Onboarding | Marchand clique "Connecter à Google" | Automatique, zéro effort |
| Code feed | Identique | Identique |
| Activation | Dès le 1er marchand | Après approbation Google + 5 vérifications |

On implémente la voie A. Le code de génération de feed est le même pour les deux voies — seul le compte Merchant Center cible change.

## Flux OAuth Google Merchant Center

### Prérequis marchand
Le marchand doit avoir :
- Un **Google Business Profile** (sa fiche Google Maps) — la grande majorité des boutiques en ont déjà un
- Un **Google Merchant Center** — sera créé pendant le flux OAuth si absent

Si le marchand n'a pas de fiche Google Maps, on l'aide à en créer une lors de l'onboarding (c'est gratuit, 5 min). C'est un prérequis car Google a besoin d'un magasin physique vérifié pour le local inventory.

### Processus
1. Marchand clique "Connecter à Google" dans le dashboard
2. Redirect vers Google OAuth avec scope `https://www.googleapis.com/auth/content`
3. Google guide le marchand à créer un Merchant Center s'il n'en a pas (et à le lier à son Business Profile)
4. Callback `/api/google/callback` → on échange le code contre des tokens
5. On récupère le `merchantId` via l'API Merchant Center
6. On stocke les tokens chiffrés dans `google_merchant_connections`
7. On récupère le `store_code` depuis le Google Business Profile du marchand (via l'API Merchant Center `accounts.storeInfos` ou saisi manuellement par le marchand). Ce code identifie la boutique physique dans Google — il doit correspondre à la fiche Google Maps de la boutique.

### Configuration Google Cloud
- Projet Google Cloud avec Merchant API activée
- OAuth 2.0 Client ID (web application)
- Redirect URI : `https://www.twostep.fr/api/google/callback`
- Scopes : `https://www.googleapis.com/auth/content`

## Product Feed (cron quotidien)

### Route : `/api/cron/google-feed`
- Schedule : `0 3 * * *` (3h du matin, tous les jours)
- Auth : `CRON_SECRET` bearer token (pattern existant)

### Pour chaque marchand avec connexion Google active :
1. Récupérer tous les produits visibles avec EAN non-null
2. Transformer en format Google
3. Soumettre via Merchant API `productInputs:insert` (ou batch via `productInputs:batchInsert`)
4. Mettre à jour `products_pushed` et `last_feed_at` dans la connexion

### Format produit Google

| Champ Google | Source Two-Step |
|---|---|
| `offerId` | `products.id` |
| `gtin` | `products.ean` |
| `title` | `products.canonical_name ?? products.name` |
| `price.value` | `products.price` (string, ex: "129.99") |
| `price.currency` | `"EUR"` |
| `imageLink` | `products.photo_processed_url ?? products.photo_url` |
| `availability` | `"in_stock"` si `stock.quantity > 0`, sinon `"out_of_stock"` |
| `channel` | `"local"` |
| `contentLanguage` | `"fr"` |
| `targetCountry` | `"FR"` |
| `condition` | `"new"` |

### Produits exclus du feed
- Pas d'EAN (`ean IS NULL`) → Google exige un GTIN pour le local inventory
- Pas visible (`visible = false`) → variantes masquées
- Pas de prix (`price IS NULL`)

## Inventory Feed (temps réel)

### Déclencheurs
1. **Après chaque sync POS** : dans `syncMerchantPOS`, après l'enrichissement EAN
2. **Après chaque webhook stock** : dans les webhook handlers (Square, Shopify, Lightspeed, etc.)

### Fonction : `pushInventoryToGoogle(merchantId, productUpdates?)`
1. Vérifie si le marchand a une connexion Google active → sinon, return silencieusement
2. Refresh le token Google si expiré
3. Pour chaque produit modifié (ou tous si sync complète) :
   - Soumet `localInventories:insert` via Merchant API
   - Champs : `storeCode`, `productId` (= offerId), `quantity`, `availability`
4. Best-effort : erreur → log + captureError, jamais de throw

### Rate limiting Google
- Merchant API : 2000 req/100 secondes par compte (largement suffisant)
- Pas de rate limiter custom nécessaire au lancement

## Nouvelle table : `google_merchant_connections`

```sql
CREATE TABLE google_merchant_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id uuid REFERENCES merchants(id) ON DELETE CASCADE UNIQUE NOT NULL,
    google_merchant_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL,
    store_code text NOT NULL,
    products_pushed integer DEFAULT 0,
    last_feed_at timestamptz,
    last_feed_status text DEFAULT 'pending'
        CHECK (last_feed_status IN ('pending', 'success', 'error')),
    last_feed_error text,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE google_merchant_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merchants_own_google_connection"
    ON google_merchant_connections FOR ALL
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
```

Les tokens `access_token` et `refresh_token` sont chiffrés avec les mêmes fonctions `encrypt`/`decrypt` que les tokens POS.

## Dashboard marchand — Onglet Google

### État : Non connecté
- Titre : "Rendez vos produits visibles sur Google"
- Texte explicatif : "Vos produits apparaîtront gratuitement sur Google Shopping et Google Maps quand un client cherche un produit près de chez vous."
- Bouton CTA : "Connecter à Google" → lance le flux OAuth
- Pas d'obligation — c'est opt-in

### État : Connecté
- Badge vert : "Connecté à Google ✅"
- Compteur : "142 produits visibles sur Google"
- Dernière sync : "Dernière mise à jour : il y a 2h"
- Statut du dernier feed : "Succès" ou "Erreur : [message]"
- Bouton : "Déconnecter" (supprime la connexion, arrête les feeds)

### Emplacement dans le dashboard
Nouvel onglet "Google" dans le menu latéral du dashboard, entre "Stock" et "Paramètres". Ou section dans la page Paramètres. À décider lors de l'implémentation selon l'espace disponible.

## Fichiers impactés

### Nouveaux fichiers
| Fichier | Responsabilité |
|---|---|
| `src/lib/google/merchant.ts` | Client Google Merchant API (auth, refresh, submit product, submit inventory) |
| `src/lib/google/feed.ts` | Génération du feed (transform produits Supabase → format Google) |
| `src/lib/google/inventory.ts` | Push inventory temps réel (`pushInventoryToGoogle`) |
| `src/app/api/google/auth/route.ts` | Initie le flux OAuth Google |
| `src/app/api/google/callback/route.ts` | Callback OAuth → stocke les tokens |
| `src/app/api/google/disconnect/route.ts` | Déconnexion Google |
| `src/app/api/cron/google-feed/route.ts` | Cron quotidien product feed |
| `src/app/dashboard/google/page.tsx` | Page dashboard Google |
| `supabase/migrations/037_google_merchant_connections.sql` | Nouvelle table |

### Fichiers modifiés
| Fichier | Modification |
|---|---|
| `src/lib/pos/sync-engine.ts` | Appel `pushInventoryToGoogle` après enrichissement |
| `src/app/api/webhooks/square/route.ts` | Appel `pushInventoryToGoogle` après update stock |
| `src/app/api/webhooks/shopify/route.ts` | Idem |
| `src/app/api/webhooks/lightspeed/route.ts` | Idem |
| `src/app/api/webhooks/zettle/route.ts` | Idem |
| `src/app/api/cron/sync-sumup/route.ts` | Appel `pushInventoryToGoogle` après sync stock SumUp |
| `vercel.json` | Ajout cron `google-feed` quotidien |
| Dashboard layout/navigation | Ajout lien "Google" |

## Gestion d'erreur

- Tout l'envoi vers Google est **best-effort** — un échec ne casse jamais le sync POS ni les webhooks
- Token Google expiré → refresh automatique via `refresh_token` (même pattern que les POS)
- Refresh échoué → marquer la connexion en erreur, le marchand devra reconnecter
- Produit rejeté par Google → log dans `last_feed_error`, continuer les autres
- Produit sans EAN → silencieusement exclu du feed (pas une erreur)
- API Google down → `captureError`, le cron réessaiera demain

## Configuration requise

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID (Google Cloud Console) |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | `https://www.twostep.fr/api/google/callback` |

## Métriques de succès

- Produits poussés vers Google sans erreur
- Au moins 1 marchand connecté et visible sur Google Free Local Listings
- Le feed quotidien tourne sans échec pendant 7 jours consécutifs

## Hors scope

- **Voie B / LFP Partner** — sera ajoutée quand Google approuve la candidature
- **Google Ads / LIA payants** — on ne fait que les Free Local Listings
- **Métriques Google avancées** — objectif futur (impressions, clics, rejets détaillés)
- **Aperçu visuel "Comment ça apparaît sur Google"** — objectif futur
