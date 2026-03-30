# Audit complet Two-Step — 2026-03-30

## Vue d'ensemble

5 audits paralleles : frontend consumer, backend securite, POS workflow, pipeline images, dashboard marchand.

| Domaine | Critical | High | Medium | Low |
|---|---|---|---|---|
| Frontend consumer | 2 | 4 | 6 | 3 |
| Backend securite | 3 | 8 | 11 | 7 |
| POS workflow | 2 | 6 | 6 | 4 |
| Pipeline images | 3 | 3 | 5 | 2 |
| Dashboard marchand | 2 | 8 | 13 | 10 |
| **TOTAL** | **12** | **29** | **41** | **26** |

---

## TOP 10 — Priorite absolue

| # | Probleme | Impact | Domaine |
|---|---|---|---|
| 1 | RPCs SQL retournent `photo_url` brut au lieu de `photo_processed_url` | Images detourees jamais montrees dans le feed | Images |
| 2 | Shopify `getStock` utilise `variant_id` au lieu de `inventory_item_id` | Stock toujours 0 pour tous les marchands Shopify | POS |
| 3 | `lookupEan()` jamais appele — enrichissement EAN inactif | Produits sans photo POS ne recoivent jamais d'image auto | Images |
| 4 | Recherche par marque cassee — "Nike" retourne 0 resultats | Flow utilisateur #1 non fonctionnel | Frontend |
| 5 | "J'arrive !" echoue silencieusement (401 muette) | Action principale du produit cassee pour les visiteurs | Frontend |
| 6 | OAuth state non signe (CSRF) — `signState()` existe mais pas utilise | Faille securite sur connexion POS | Securite |
| 7 | Upload images sans validation type/taille | Accepte n'importe quel fichier, risque XSS via SVG | Securite |
| 8 | Square/Zettle ne retournent jamais de categorie | Filtres par categorie inutiles pour ces POS | POS |
| 9 | Cron images : 5 images/jour, 40 jours pour 200 produits | Onboarding marchand degrade | Images |
| 10 | Dashboard `hasEmail` verifie `merchant.phone` | Etape onboarding fausse | Dashboard |

---

## 1. FRONTEND CONSUMER

### Critical

**BUG-FC1 — Recherche par marque ne fonctionne pas**
- Page : `/search`
- Repro : Taper "Nike" dans la barre de recherche
- Resultat : "Aucun resultat" malgre une suggestion "Marque Nike" dans la dropdown
- Impact : Un utilisateur ne peut trouver aucun produit par marque

**BUG-FC2 — "J'arrive !" echoue silencieusement sans feedback**
- Page : `/product/*` (toute fiche produit)
- Repro : Selectionner une pointure, cliquer "J'arrive !"
- Resultat : Rien ne se passe. Erreur 401 silencieuse sur `/api/intents` en console
- Impact : Action principale cassee pour les visiteurs non connectes

### High

**BUG-FH1 — Recherche par categorie/type generique ne fonctionne pas**
- Page : `/search`
- Repro : Taper "bijou" ou "chaussure"
- Resultat : "Aucun resultat" malgre les suggestions de categorie

**BUG-FH2 — Pas de gestion des tailles sur /profile**
- Page : `/profile`
- Le CTA "Pour toi" redirige vers `/profile` qui n'affiche pas la section tailles
- Boucle sans fin possible

**BUG-FH3 — Le filtre taille ne filtre rien**
- Page : `/discover`
- Le badge "1" apparait mais aucun filtrage reel des produits

**BUG-FH4 — Onboarding totalement absent**
- Page : `/onboarding`
- Flash du logo puis redirect immediate vers `/discover`

### Medium

**BUG-FM1 — "Pour toi" vide sans empty state attractif**
- Page quasi vide avec juste un bandeau orange CTA, API 401 en console

**BUG-FM2 — Bouton favori absent sur desktop (fiche produit)**
- Le bouton coeur disparait en viewport desktop (1024px+)

**BUG-FM3 — Onglet "Avis" ne change pas le contenu sur les pages boutique**
- Le contenu "Promos" reste affiche sous l'onglet "Avis"

**BUG-FM4 — Login page avec wording marchand**
- Placeholder "vous@boutique.fr" sur une page partagee consommateur/marchand

**BUG-FM5 — Sections "Promos du moment" et "Promotions" dupliquees**
- Deux sections avec les memes produits et quasi meme description

**BUG-FM6 — Chips categories inconsistantes entre /discover et /search**
- Discover : chips bleues avec emojis / Search : pills gris sans emojis

### Low

**BUG-FL1 — Bouton forgot-password noir au lieu de bleu**
**BUG-FL2 — Navbar homepage cassee sur mobile (375px)**
- "Two-Step" coupe sur deux lignes, boutons crampes

**BUG-FL3 — Tailles manquantes dans le filtre discover**
- Pointures 46-50 et tailles enfant 2A-16A absentes du filtre discover (malgre qu'elles sont dans le profil)

---

## 2. BACKEND SECURITE

### Critical

**SEC-C1 — OAuth state parameter non signe (CSRF)**
- Fichiers : `src/app/api/pos/[provider]/auth/route.ts`, `callback/route.ts`
- Le state OAuth est `{provider}:{merchantId}` en clair
- `src/lib/auth/state-token.ts` avec `signState()`/`verifyState()` existe mais n'est utilise nulle part
- Fix : Utiliser `signState()` dans auth et `verifyState()` dans callback

**SEC-C2 — Middleware ne protege pas 21 routes API**
- Le matcher ne couvre que `/api/pos/*`, `/api/email/*`, `/api/stripe/*`, `/api/consumer/*`, `/api/admin/*`
- Routes hors middleware : `/api/merchants`, `/api/products`, `/api/stock`, `/api/promotions`, `/api/favorites`, `/api/follows`, `/api/intents`, `/api/suggestions`, `/api/images/upload`, `/api/stories`, `/api/page-views`
- Chaque route fait sa propre auth mais pas de defense en profondeur
- Fix : Ajouter `/api/:path*` au matcher

**SEC-C3 — Pas de validation de fichier sur l'upload d'images**
- Fichier : `src/app/api/images/upload/route.ts`
- Aucune verification type MIME, aucune limite de taille
- Un `.exe`, `.html`, SVG avec XSS sera accepte et stocke sur R2
- Fix : Whitelist type MIME + limite 10 Mo + validation magic bytes

### High

**SEC-H1 — Admin PATCH renvoie toutes les colonnes** — `.select()` sans colonnes specifiques
**SEC-H2 — Admin consumers expose les `user_id` bruts**
**SEC-H3 — Absence de rate limiting sur les routes d'ecriture** — 15+ routes sans rate limit
**SEC-H4 — Injection de prompt LLM via nom de marchand** — dans la route tips/Groq
**SEC-H5 — Tips route fait une requete interne non authentifiee** — server-to-server via HTTP avec forwarding cookies
**SEC-H6 — Webhook Stripe : pas d'idempotence, `subscription.deleted` non implemente**
**SEC-H7 — Stories DELETE ne verifie pas l'ownership** — repose uniquement sur RLS
**SEC-H8 — Achievements GET : IDOR** — tout utilisateur peut lister les achievements de n'importe quel marchand

### Medium

**SEC-M1** — Route `verify-siret` dupliquee (une sans auth ni rate limit)
**SEC-M2** — `page-views` accepte n'importe quel merchant_id sans validation
**SEC-M3** — `available-sizes` utilise adminClient sans raison
**SEC-M4** — Console.error avec details internes dans les reponses
**SEC-M5** — Parametre `size` non valide par Zod dans discover route
**SEC-M6** — `by-merchants` sans auth ni rate limit — scraping possible
**SEC-M7** — `shoe_size` PUT ne verifie pas le type (string acceptee)
**SEC-M8** — `products/[id]` PATCH ne valide pas `available_sizes` ni `visible`
**SEC-M9** — Merchant GET avec `select("*")` + cache public sur donnees privees
**SEC-M10** — N+1 queries dans les webhooks POS
**SEC-M11** — Middleware fail-open (si Supabase down, tout passe)

### Low

**SEC-L1** — `GROQ_API_KEY` fallback "placeholder"
**SEC-L2** — R2 public URL en dur dans le code
**SEC-L3** — Pas de Content-Security-Policy header
**SEC-L4** — Suggestions route silently drops rejected messages
**SEC-L5** — Intents GET utilise adminClient sans necessite
**SEC-L6** — 6 POST routes sans schema Zod
**SEC-L7** — Mapbox token expose cote client (normal mais verifier restriction domaine)

---

## 3. POS WORKFLOW

### Critical

**POS-C1 — RPC `create_product_with_stock` recoit `p_pos_provider` inexistant**
- sync-engine.ts:217 passe `p_pos_provider` mais la RPC SQL n'accepte que 7 params
- La colonne `pos_provider` reste NULL pour tous les nouveaux produits
- Perte de tracabilite POS

**POS-C2 — Shopify `getStock` utilise `variant_id` au lieu de `inventory_item_id`**
- Le stock de TOUS les produits Shopify est systematiquement 0
- Les produits Shopify n'apparaissent jamais (filtre `s.quantity > 0`)

### High

**POS-H1** — Upsert `pos_connections` avec `onConflict: "merchant_id"` ne matche pas la contrainte UNIQUE(merchant_id, provider)
**POS-H2** — RPCs feed/discover retournent `photo_url` brut, pas `photo_processed_url`
**POS-H3** — Square et Zettle ne retournent jamais de `category` (toujours null)
**POS-H4** — Shopify `getStock` fait du N+1 (une requete par produit)
**POS-H5** — Pas de webhook ni cron pour SumUp — uniquement polling client-side
**POS-H6** — La route `/api/stock` PATCH ne recalcule pas `available_sizes`

### Medium

**POS-M1** — Produits sans EAN marques `visible: false` (design voulu, onglet Incomplete)
**POS-M2** — EAN prefix grouping (12 chars) peut mal grouper des produits non relies
**POS-M3** — Shopify `parseWebhookEvent` traite les commandes, pas les inventaires
**POS-M4** — Image processing cron 1x/jour, 5 images/batch = 40 jours pour 200 produits
**POS-M5** — `extractSize` faux positifs : "Lot de 20 serviettes" → taille 20, "Samsung Galaxy S24" → taille 24
**POS-M6** — Zettle ne retourne jamais de `photo_url` (hard-code null)

### Low

**POS-L1** — Lightspeed `getStock` fait du N+1 comme Shopify
**POS-L2** — Lightspeed appelle `Account.json` 4 fois par sync
**POS-L3** — Lightspeed promos limitees aux 100 premiers items
**POS-L4** — Pas de gestion des produits supprimes cote POS

---

## 4. PIPELINE IMAGES

### Critical

**IMG-C1 — `lookupEan()` jamais appele — code mort**
- `src/lib/ean/lookup.ts` exporte la fonction mais elle n'est importee nulle part
- Les APIs OpenEAN et UPCItemDB ne sont jamais interrogees
- Fix : Appeler dans sync-engine apres creation d'un produit avec EAN sans photo

**IMG-C2 — RPCs SQL retournent `photo_url` et ignorent `photo_processed_url`**
- Toutes les RPCs (get_feed_nearby, get_promos_nearby, get_products_nearby) retournent `p.photo_url`
- Les images detourees en WebP 800x800 sur R2 ne sont jamais montrees dans les feeds
- Fix : `COALESCE(p.photo_processed_url, p.photo_url) AS product_photo`

**IMG-C3 — Produits sans EAN invisibles** (meme finding que POS-M1)

### High

**IMG-H1** — Zettle hard-code `photo_url: null` alors que l'API fournit des images
**IMG-H2** — Aucune recherche d'image web pour les produits sans photo
**IMG-H3** — Cron 1x/jour, 5 images/batch — extremement lent

### Medium

**IMG-M1** — Pas de `Cache-Control` sur les uploads R2
**IMG-M2** — Script legacy stocke sur Supabase Storage au lieu de R2
**IMG-M3** — Domaine R2 absent de `next.config.mjs` — pas d'optimisation Next.js Image
**IMG-M4** — rembg expose sans authentification sur le VPS
**IMG-M5** — Retry rembg trop lent (1 cron/jour, 3 tentatives = 3 jours minimum)

### Low

**IMG-L1** — Script Unsplash = mapping statique pour demo seulement
**IMG-L2** — `/placeholder-product.svg` reference mais inexistant

---

## 5. DASHBOARD MARCHAND

### Critical

**DASH-C1 — `hasEmail` verifie `merchant.phone` au lieu de `merchant.email`**
- dashboard/page.tsx:42 et onboarding-checklist.tsx:28
- Un marchand avec telephone mais sans email est marque comme ayant complete l'etape email

**DASH-C2 — Duplication logique onboarding entre page.tsx et onboarding-checklist.tsx**
- Deux fichiers calculent les memes 5 etapes avec des requetes separees
- Si la logique diverge, l'etat sera incoherent

### High

**DASH-H1** — MetricCards `grid-cols-4` sans breakpoint mobile (products + stock)
**DASH-H2** — Categories non reconnues par les emojis/couleurs (majuscules vs minuscules)
**DASH-H3** — Pas d'upload de photo de boutique dans /dashboard/store
**DASH-H4** — Promotions : sale_price peut etre > prix original (pas de validation)
**DASH-H5** — Photo upload impossible pour les nouveaux produits (conditionne a productId)
**DASH-H6** — Page Stories : style incoherent avec le reste du dashboard
**DASH-H7** — Tips-history : couleurs ancienne charte terracotta (#f0ebe0)
**DASH-H8** — Race condition signup marchand (signUp puis POST /api/merchants)

### Medium

**DASH-M1** — Memory leak : `URL.createObjectURL` sans `revokeObjectURL` (products + stories)
**DASH-M2** — Variable CSS `--ts-terracotta` vaut `#4268FF` (bleu)
**DASH-M3** — 5 cartes POS empilees verticalement dans settings
**DASH-M4** — Promotions : date passee acceptee sans avertissement
**DASH-M5** — Pas d'edition de promotion (suppression uniquement)
**DASH-M6** — Input stock uncontrolled avec defaultValue + key
**DASH-M7** — Polling 30s IntentSignals sans WebSocket
**DASH-M8** — ExternalQuickLink utilise `<a>` au lieu de `<Link>` pour route interne
**DASH-M9** — Pas de geocodage automatique de l'adresse
**DASH-M10** — Horaires : pas de validation open < close
**DASH-M11** — `hasCheckedRef` empeche le re-check achievements apres navigation
**DASH-M12** — Loading state incomplet sur product edit
**DASH-M13** — Double instanciation de `useMerchant` (double fetch)

### Low

**DASH-L1** — Aucun champ email de contact dans settings
**DASH-L2** — Tabs disabled mais cliquables (products/new)
**DASH-L3** — Page Stories absente de `pageTitles` dans mobile-top-bar
**DASH-L4** — Stock et Trophees absents de la navigation mobile bottom
**DASH-L5** — Toasts masques par le bottom tab bar sur mobile
**DASH-L6** — Stagger classes dynamiques non purgees par Tailwind
**DASH-L7** — `.search-ts` largeur fixe 280px
**DASH-L8** — SIRET fallback silencieux sans token INSEE
**DASH-L9** — Lien Square pointe vers site americain
**DASH-L10** — Icones SVG inline dans sidebar au lieu de @untitledui/icons

---

## POINTS POSITIFS

- **Supabase RLS + ownership verification** : quasi toutes les routes d'ecriture verifient l'ownership
- **Input validation Zod** : systeme solide dans `src/lib/validation.ts` sur la majorite des routes consumer
- **Security headers** : HSTS, X-Frame-Options DENY, nosniff, strict Referrer-Policy, Permissions-Policy
- **Tokens POS chiffres** : AES-256-GCM avant stockage
- **Webhook signature verification** : tous les webhooks POS + Stripe verifient les signatures
- **Rate limiting infrastructure** : Upstash Redis en prod + fallback in-memory en dev
- **Error capture Sentry** : integre partout via `captureError()`
- **Filtres categorie consumer** : fonctionnent correctement
- **Navigation bottom tabs** : fonctionnelle
- **Page carte/explore** : Mapbox avec pins, recherche, toggle Liste/Carte

---

## PLAN DE CORRECTION SUGGERE

### Semaine 1 — Bloquants

1. Fix RPCs SQL : `COALESCE(photo_processed_url, photo_url)` (IMG-C2)
2. Fix Shopify getStock : utiliser `inventory_item_id` (POS-C2)
3. Activer `lookupEan()` dans sync-engine (IMG-C1)
4. Signer OAuth state avec `signState()` (SEC-C1)
5. Validation upload images : type MIME + taille (SEC-C3)
6. Fix `hasEmail` → `merchant.email` (DASH-C1)

### Semaine 2 — Importants

7. Fix recherche par marque (BUG-FC1)
8. Fix "J'arrive !" feedback pour non-connectes (BUG-FC2)
9. Rate limiting routes d'ecriture (SEC-H3)
10. Square/Zettle categories : auto-detection par nom (POS-H3)
11. Augmenter cron images (toutes les heures, batch 20) (IMG-H3)
12. Fix ownership check stories DELETE (SEC-H7)
13. Supprimer section "Promos du moment" dupliquee (BUG-FM5)

### Semaine 3 — Ameliorations

14. Elargir middleware matcher (SEC-C2)
15. Dashboard responsive metriques (DASH-H1)
16. Upload photo boutique dans /store (DASH-H3)
17. Zettle : recuperer photos via imageLookupKeys (IMG-H1)
18. Recherche image web fallback (IMG-H2)
19. Fix filtre taille discover (BUG-FH3)
20. Cache-Control immutable sur R2 (IMG-M1)
