# Rapport Alpha Correction — Two-Step — 2026-04-05

## Synthese

| Domaine | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Consumer Frontend | 0 | 4 | 9 | 28 | 41 |
| Backend Security | 3 | 7 | 10 | 5 | 25 |
| Workflow E2E | 2 | 3 | 7 | 8 | 20 |
| Image Pipeline | 2 | 4 | 6 | 4 | 16 |
| Merchant Dashboard | 3 | 8 | 9 | 7 | 27 |
| **Total (brut)** | **10** | **26** | **41** | **52** | **129** |
| **Deduplique** | **8** | **22** | **~35** | **~45** | **~110** |

## TOP 10 Priorites

| # | Sev | Description | Source |
|---|---|---|---|
| 1 | CRIT | Vercel crons envoient GET, mais les routes n'exportent que POST — image processing, EAN enrichment, Google feed ne tournent JAMAIS | Agent 4 |
| 2 | CRIT | Shopify `getStock` passe `variant.id` au lieu de `inventory_item_id` — stock toujours 0 pour marchands Shopify | Agent 3 |
| 3 | CRIT | Fastmag SQL injection via EDI query — `refs` interpolees sans echappement | Agent 2 |
| 4 | CRIT | Products GET expose tous les produits (y compris hidden) sans authentification | Agent 2 |
| 5 | CRIT | Email OAuth callback ne verifie pas que l'utilisateur possede le merchant | Agent 2 |
| 6 | CRIT | OAuth callback `onConflict: "merchant_id"` au lieu de `"merchant_id,provider"` | Agent 3 |
| 7 | CRIT | `get_products_nearby` RPC utilise `photo_url` brut au lieu de `COALESCE(photo_processed_url, photo_url)` — images traitees jamais affichees | Agent 3+4 |
| 8 | CRIT | `get_merchants_nearby` regression : variants/hidden comptes dans product_count | Agent 3 |
| 9 | HIGH | Page Factures inaccessible (aucun lien navigation) + CSS classes indefinies | Agent 5 |
| 10 | HIGH | Clictill promo `product_ids` utilise `id_article` au lieu de `reference` — promos jamais liees | Agent 3 |

## Tous les bugs par domaine

### Backend Security (Agent 2)

- **C1** Fastmag SQL injection via EDI `STOCK_SQL` — refs non echappees
- **C2** Email OAuth callback sans verification user ownership
- **C3** Products GET sans auth — expose produits hidden + incomplete
- **H1** Pas de rate limiting sur routes write (sync, upload, validate, stripe...)
- **H2** Image upload — pas de verification magic bytes
- **H3** N+1 queries dans les 4 webhook handlers
- **H4** N+1 queries dans invoice validation
- **H5** N+1 queries dans sync engine
- **H6** Middleware fail-open sur exception
- **H7** Promotions GET expose toutes les promos sans auth
- **M1-M10** Admin PATCH leak, SIRET JSON parse, prefs sans Zod, products/by-merchants sans auth, console.error leak, admin client pour public data, suggestions silently dropped, merchant string length, connect-direct error leak

### Workflow E2E (Agent 3)

- **C1** OAuth callback `onConflict: "merchant_id"` mismatch
- **C2** Shopify `getStock` utilise `variant.id` au lieu de `inventory_item_id`
- **H1** Clictill promo IDs mismatch (id_article vs reference)
- **H2** `get_products_nearby` photo_url sans COALESCE
- **H3** `get_merchants_nearby` regression visible/variant filters
- **M1** Promo subquery missing `starts_at` check
- **M2** `search_products_nearby` pas de filtre taille
- **M3** Shopify getStock N+1
- **M4** Lightspeed getStock N+1
- **M5** Lightspeed Account API appele 3x par sync
- **M6** Delivery confirmation active TOUT le stock incoming
- **M7** Invoice file_url expire apres 7 jours
- **M8** `get_products_nearby` aussi manque canonical_name COALESCE

### Image Pipeline (Agent 4)

- **C1** `get_products_nearby` RPC sans COALESCE (doublon Agent 3)
- **C2** Vercel crons GET vs routes POST — rien ne tourne
- **H1** Missing Next.js image domains (Zettle, Lightspeed, Square sandbox, Fastmag)
- **H2** Clictill photo_url toujours null — 6500 marchands sans photos
- **H3** Fastmag EDI ImageURL non valide
- **H4** Image processing 5 jobs/jour — backlog de semaines
- **M1-M6** photo_processed_url pas cleared, sync-sumup fantome, dashboard raw img, EAN pas de qualite compare, SSRF risk, invoice no image job existing products

### Consumer Frontend (Agent 1)

- **H1** forgot-password et reset-password styling completement different
- **H2** reset-password redirige toujours vers /dashboard (meme consumer)
- **H3** Merchant signup lat/lng hardcode a 0,0
- **H4** (reclasse medium) Shop profile fetch avec slug au lieu de UUID
- **M1-M9** not-found old CSS vars, onboarding redirect orphelin, explore map polling fragile, infinite scroll race condition, search pas d'error handling, geolocation fallback silencieux, "Pour toi" vide sans size prefs, WelcomeGate pas de validation password, shop products stale ID

### Merchant Dashboard (Agent 5)

- **C1** Page Factures — CSS classes indefinies (badge-ts, card-ts, input-ts, btn-ts-secondary)
- **C2** Page Factures inaccessible — aucun lien navigation
- **C3** Page Factures — breadcrumb/title maps manquants
- **H1-H8** Factures hardcoded colors, --ts-ochre obsolete, grid pas responsive, invoice detail pas d'error handling, support email inconsistant, Google page title manquant, Google PageHeader sans titleAccent, Factures loading skeleton hardcoded
- **M1-M9** Edit product flash, photo upload create only, taille unique hardcoded blue, incomplete submit no toast, duplicate onboarding logic, stagger skip, search-ts hardcoded white, Google no error handling, Google no disconnect toast
