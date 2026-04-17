# Rapport d'audit Two-Step — 2026-04-17

**5 agents, ~175 issues brutes, ~120 uniques apres dedup**

## Tableau de synthese

| Domaine | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Consumer Frontend | 4 | 11 | 16 | 12 | 43 |
| Backend Security | 2 | 6 | 12 | 8 | 28 |
| Workflow E2E | 1 | 10 | 18 | 4 | 33 |
| Image Pipeline | 2 | 1 | 6 | 6 | 15 |
| Dashboard Marchand | 5 | 10 | 13 | 10 | 38 |
| **TOTAL** | **14** | **38** | **65** | **40** | **~120** |

---

## TOP 15 — A corriger en priorite

### BLOQUANTS (empechent l'usage normal)

| # | Severity | Issue | Impact | Fichier |
|---|---|---|---|---|
| 1 | **CRIT** | Cron images = POST-only, Vercel envoie GET | **Les images ne sont JAMAIS traitees** — tous les jobs restent `pending` | `api/images/process/route.ts` |
| 2 | **CRIT** | Cron cleanup = POST-only idem | feed_events jamais nettoyes | `api/cron/cleanup/route.ts` |
| 3 | **CRIT** | Webhook email bypass si secret non configure | N'importe qui peut injecter des factures | `api/inbound-email/route.ts:34` |
| 4 | **CRIT** | Cron routes acceptent `Bearer undefined` | Si CRON_SECRET non set, crons ouverts a tous | `api/cron/*.ts` |
| 5 | **CRIT** | Page views non authentifie | N'importe qui peut gonfler le score d'un marchand | `api/page-views/route.ts` |

### CORROMPENT LES DONNEES

| # | Severity | Issue | Impact | Fichier |
|---|---|---|---|---|
| 6 | **CRIT** | Shopify webhook sans idempotence | Double decrement de stock sur retry | `webhooks/shopify/route.ts` |
| 7 | **HIGH** | groupVariantsByEAN marque visible meme si stock=0 | Consommateurs voient des produits en rupture | `pos/sync-engine.ts:540` |
| 8 | **HIGH** | PATCH /api/stock non-atomique (TOCTOU) | Stock incorrect en concurrence | `api/stock/route.ts:50-79` |
| 9 | **HIGH** | Zettle accepte SKU non-EAN comme EAN | Corrompt l'enrichissement | `pos/zettle.ts:108` |
| 10 | **HIGH** | Edit produit perd les tailles available_sizes | Tailles disparaissent apres edition | `products/[id]/edit/page.tsx` |

### DEGRADENT L'EXPERIENCE

| # | Severity | Issue | Impact | Fichier |
|---|---|---|---|---|
| 11 | **HIGH** | Impossible d'ajouter photo a la creation produit | UX cassee, oblige a creer puis re-editer | `product-form.tsx:114` |
| 12 | **HIGH** | InfiniteProductGrid ne re-trigger pas apres filtre | Grille vide apres changement de categorie | `infinite-product-grid.tsx` |
| 13 | **HIGH** | activateInvoice crash pour Clictill/Fastmag | Bloque l'onboarding de ces marchands | `invoice/activate.ts:105` |
| 14 | **HIGH** | Rate limiting absent sur 17+ routes mutation | Spam Stripe checkout = cout reel | `api/stripe/*`, `api/invoices/*`, etc. |
| 15 | **HIGH** | Legacy CSS vars (--ts-*) sur 15+ composants | Composants invisibles si vars supprimees | `explore/page.tsx`, `not-found.tsx`, etc. |

---

## Detail par domaine

### A. Backend Security (28 issues)

**CRITICAL**
- **SEC-1**: Webhook email — `if (WEBHOOK_SECRET && ...)` skip la verif si secret vide
- **SEC-2**: Page views — endpoint public, pas d'auth, gonfle les scores
- **SEC-3**: Cron routes — `Bearer undefined` bypass quand CRON_SECRET non set

**HIGH**
- **SEC-4**: Rate limiting manquant sur 17 routes mutation (stripe/checkout, invoices, products CRUD, follows, favorites, push/subscribe, stock, intents, achievements)
- **SEC-5**: Admin stats fetch ALL merchants sans pagination — DoS vector
- **SEC-6**: Invoice validate N+1 (200+ queries sequentielles par facture)
- **SEC-7**: Catalog import N+1 meme pattern
- **SEC-8**: products/available-sizes utilise adminClient sans auth
- **SEC-9**: Pas de security headers (CSP, X-Frame-Options, HSTS)

**MEDIUM** : Error message leakage (4 routes), catalog import sans magic bytes, verify-siret JSON non wrape, consumer preferences JSON non wrape, discover filtres sans limite longueur, push N+1, suggestions sans verif merchant exists

### B. Consumer Frontend (43 issues)

**CRITICAL**
- **FE-1**: InfiniteProductGrid — `hasMoreRef` ne trigger pas de re-render, "Tu as tout vu" jamais affiche
- **FE-2**: InfiniteProductGrid — pas de re-trigger apres reset de filtre
- **FE-3**: ForYouFeed — stale closure sur `followedSet`, produits des shops suivis dans les suggestions
- **FE-4**: Merchant signup envoie lat/lng 0,0 (marchand au milieu du Golfe de Guinee)

**HIGH**
- **FE-5**: Hardcoded hex colors (bg-red-50, text-gray-400...) dans auth + stock-badge + contact
- **FE-6**: Legacy var(--ts-*) dans 15+ fichiers (explore, shop-card, side-panel, bottom-sheet, filter-pills, feed-skeleton, toast, not-found)
- **FE-7**: Touch targets < 44px sur FilterPanel, WelcomeGate sizing, Explore filter dropdown
- **FE-8**: `(product as any).stock` unsafe dans favorites
- **FE-9**: Shop profile fetch promos direct Supabase client-side (bypass RLS)
- **FE-10**: history.back() sort de l'app sur deeplinks (product detail + shop)
- **FE-11**: Explore map polls DOM avec setInterval au lieu de map.on('load')
- **FE-12**: useFollows() x50 dans MerchantListCard (N+1 hooks)

### C. Workflow End-to-End (33 issues)

**CRITICAL**
- **WF-1**: Shopify webhook — pas d'idempotence, double decrement sur retry

**HIGH**
- **WF-2**: groupVariantsByEAN visible=true meme si totalStock=0
- **WF-3**: activateInvoice appelle pushCatalog sur Clictill/Fastmag qui throw
- **WF-4**: Zettle EAN = variant.barcode ?? variant.sku (SKU non-numerique accepte)
- **WF-5**: Rate limiter en memoire — inutile en serverless
- **WF-6**: PATCH stock TOCTOU (read-then-write au lieu de updateStockAtomic)
- **WF-7**: Lightspeed webhook idempotence manquante (mode delta)
- **WF-8**: Sync lock pas vraiment atomique (2 syncs simultanees possibles)
- **WF-9**: createProduct throw bloque tout le sync (1 produit invalide = 0 sync)
- **WF-10**: POS disconnect ne nettoie pas les promotions

**MEDIUM** : Lightspeed 4x Account.json par sync, extractSize faux positifs, signed URL factures expire 7j, 2 routes email inbound dupliquent 90% du code, EAN cache sans staleness, Serper sans rate limit, image R2 key collision, feed ne filtre pas stock=0, promos feed sans filtre taille, Google feed pousse produits OOS, Google inventory pas de batch, promos expirees jamais nettoyees, EAN-12 rejete par PATCH mais accepte par sync

### D. Image Pipeline (15 issues)

**CRITICAL**
- **IMG-1**: `api/images/process/route.ts` — POST-only, Vercel cron GET = **images jamais traitees**
- **IMG-2**: `api/cron/cleanup/route.ts` — POST-only idem

**HIGH**
- **IMG-3**: rembg sans timeout — peut bloquer indefiniment

**MEDIUM** : photo_source type manque "serper", pas de retry suffisant rembg, deleteFromR2 jamais appele, Fastmag photo colonnes non validees, pas de blurDataURL/placeholder, pas d'upload logo/cover dans dashboard

### E. Dashboard Marchand (38 issues)

**CRITICAL**
- **DASH-1**: badge-info/badge-success CSS classes inexistantes — factures sans style
- **DASH-2**: Loading skeleton factures utilise raw Tailwind (gray-200)
- **DASH-3**: URL.createObjectURL jamais revoque — fuite memoire mobile
- **DASH-4**: Promo prix 0 accepte (validation insuffisante)
- **DASH-5**: Edit produit perd les available_sizes

**HIGH**
- **DASH-6**: "Tout publier" lance 100+ requetes concurrentes sans throttle
- **DASH-7**: Pas de pagination produits (tout charge d'un coup)
- **DASH-8**: Edit page charge TOUS les produits pour en trouver 1
- **DASH-9**: Impossible d'ajouter photo a la creation produit
- **DASH-10**: Toasts caches derriere bottom tab bar mobile
- **DASH-11**: useMerchant() fetch x3-4 (pas de context provider)
- **DASH-12**: useCoachTips loading init false (pas de skeleton)
- **DASH-13**: "Produit introuvable" affiche pendant chargement (pas de loading check)
- **DASH-14**: Onboarding checklist dupliquee (page.tsx vs composant)

---

## Points positifs

1. **OAuth CSRF** : tokens signes HMAC avec comparaison constant-time
2. **Webhook signatures** : 5 POS + Stripe verifient les signatures
3. **Ownership checks** : quasi toutes les routes marchands verifient user_id
4. **File upload** : magic bytes + taille + HTTPS sur images/upload
5. **POS tokens chiffres** : AES-256-GCM en base
6. **Pas de secrets client-side** : aucun `process.env.` sans NEXT_PUBLIC_ cote client
7. **Input sanitization** : nettoyage admin search, filename sanitization
8. **Dedup SHA-256** : pas de doubles imports de fichiers
9. **Feed score** : algorithme log-scale intelligent pour l'engagement
10. **Serper pipeline** : 4 strategies cascade + verif IA + score composite

---

## Plan de correction suggere

### Semaine 1 — Critiques + Security

1. Crons POST → ajouter `export { POST as GET }` (IMG-1, IMG-2) — **5 min**
2. Webhook email bypass (SEC-1) — **5 min**
3. Cron `Bearer undefined` (SEC-3) — **10 min**
4. Page views auth (SEC-2) — **15 min**
5. Shopify webhook idempotence (WF-1) — **30 min**
6. Rate limiting sur 17 routes (SEC-4) — **1h**

### Semaine 2 — Data integrity

7. groupVariantsByEAN stock=0 (WF-2) — **15 min**
8. PATCH stock atomique (WF-6) — **15 min**
9. Zettle EAN validation (WF-4) — **10 min**
10. activateInvoice Clictill/Fastmag (WF-3) — **10 min**
11. Edit produit preserve tailles (DASH-5) — **30 min**
12. Promo prix 0 validation (DASH-4) — **5 min**

### Semaine 3 — UX critical

13. InfiniteProductGrid re-trigger (FE-2) — **30 min**
14. Photo a la creation produit (DASH-9) — **45 min**
15. Legacy CSS vars migration (FE-6) — **2h**
16. Touch targets 44px (FE-7) — **30 min**
17. rembg timeout (IMG-3) — **15 min**
18. Merchant signup geocoding (FE-4) — **30 min**

### Semaine 4+ — Medium/Low

Pagination produits, merchant context provider, security headers, blurDataURL, etc.
