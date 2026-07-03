# Maillon M9 — Onboarding pilote

> Le maillon qui rend Deerskin **onboardable** : brancher sa caisse OU pousser son fichier,
> voir ce qui serait publié AVANT de publier (shadow/preview), valider. Nord : **confiance**
> — le marchand voit exactement ce que Google recevra, en lecture seule, sans surprise.

## Rôle
Guider le marchand pilote de l'inscription jusqu'à un catalogue prêt à publier : onboarding
marchand, wizard d'import stock (preview → apply), connexion POS, et **preview shadow** du feed
Google exact.

## Contrat I/O
- **Entrée** : inscription marchand ; fichier CSV/XLSX (wizard) ; choix de caisse (OAuth) ;
  requête preview / token.
- **Sortie garantie** : ligne `merchants` créée ; import en 2 temps (preview lecture-seule → apply) ;
  `feed-preview` = `{would_publish[], blocked[{reasons}], summary, google_connected, gtin_only_tier}` ;
  `ingest/token` = `{token, push_url, example_curl, last_used_at, last_rows, last_status}`.

## Invariants nord (TESTÉS — pas des intentions)

1. **Preview = parité 100 % avec le feed live.** `GET /api/google/feed-preview` réutilise le MÊME gate
   (`classifyFeedRow` ⟺ `isFeedEligible`) et le MÊME `transformProductToGoogle` que les feeds live →
   ce que le marchand voit = ce que Google recevra. *→ `tests/lib/google/feed-preview.test.ts`.*
2. **Preview strictement LECTURE-SEULE.** Aucun appel Google, aucune écriture DB — pur calcul + SELECT.
   Population identique aux feeds live (visible/validated/non-archivé/non-variante).
3. **Causes de blocage exactes et ordonnées** par produit (`ean → prix → image`), avec respect du tier
   GTIN-only (image non-cause si `allowMissingImage`). *idem test.*
4. **Import en 2 temps.** Étape 1 `mode=preview` → `/api/catalog/import` **n'écrit rien**, renvoie un
   aperçu ; étape 2 (sans `mode`) → apply réelle + toast « N créés / N mis à jour » + refetch. `!res.ok
   → throw` (jamais cacher une erreur API). (`components/stock/import-wizard.tsx`, `my-stock-view.tsx`.)
5. **Redirections onboarding sûres** : `devenir-marchand` redirige si `!user` (login) ou si marchand
   existe déjà (`/dashboard`) ; `pos/page` redirige `no-merchant` mais JAMAIS sur un blip (garde M8 E5).
6. **Token : jamais de silent-failure.** `ingest/token` : `!merchantId` → 401 ; `getOrCreateIngestToken`
   crée à la volée ; erreur → 500 + `captureError` ; POST = rotation. Historique (`last_used_at/rows/status`)
   pour que le marchand voie la fraîcheur de son dernier push.

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| Preview — lecture marchand KO | 403 (PGRST116) ou 500 tracé | `feed-preview/route.ts` |
| Preview — lecture produits KO | **500** (jamais un preview vide trompeur) | `feed-preview/route.ts` |
| Import étape 1/2 — API KO | **throw** (jamais masquer) | `import-wizard` |
| Token GET/POST — erreur | **500** + `captureError` | `ingest/token/route.ts` |
| Pas de marchand | 401 (token) / redirect login (onboarding) | — |

## Preuves exigées
- **Unit (fait)** : `feed-preview` (parité gate, causes exactes, tier GTIN-only). 
- **TROUS DE PREUVE** :
  - `ingest/token`, `import-wizard`, `pos-wizard` : **aucun test dédié** (l'import est exercé
    indirectement via `catalog/import`). À couvrir.
  - **Rendu VISUEL du wizard** (états intermédiaires, spinners, illustrations, couleur `#4268FF`
    codée en dur) = **exige des yeux** (Thomas/Playwright).
  - `BecomeMerchantForm` (champs requis, validation) et le flux OAuth `/api/pos/{provider}/connect` =
    **boîtes noires** à ce stade, non inspectées.
- **PREUVE RÉELLE** : un onboarding pilote de bout en bout (inscription → import/connexion → preview →
  publication) — le vrai test d'usage, exige Thomas + marchand pilote.

## Statut réel + dette connue
- **done (data-backing)** : `feed-preview` (parité, lecture-seule), `ingest/token` (rotation, historique),
  import 2 temps, redirections sûres.
- **RESTE** :
  - **Wizard UI à finir/polir** (rendu visuel, états intermédiaires) — Thomas/Playwright.
  - **Tests manquants** : token, import-wizard, pos-wizard.
  - **Onboarding consumer** (`onboarding/page.tsx`) : illustrations SVG + couleur en dur (drift si charte
    change) ; animations Framer non testées.
  - **Flux OAuth POS** non inspecté (Square/Shopify/… `connect`) — à auditer.

## Périmètre Fable 5
- **AUDITER** : réfuter « preview = ce que Google reçoit » (chercher une divergence gate/transform/
  population entre preview et feed live). Vérifier que le preview et le token n'écrivent jamais par
  effet de bord. Inspecter le flux OAuth POS (boîte noire) et `BecomeMerchantForm` (validation).
- **CONSTRUIRE** : les **tests manquants** (token, import-wizard, pos-wizard) ; auditer/durcir le flux
  OAuth. Le **rendu visuel du wizard** = Thomas/Playwright (pas Fable 5). Barre de preuve = tests +
  onboarding réel supervisé.
