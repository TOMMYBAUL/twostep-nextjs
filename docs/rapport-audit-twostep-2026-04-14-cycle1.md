# Rapport Alpha Correction — Cycle 1
**Date :** 2026-04-14 | **Agents :** 4/5 (sécurité, workflow, dashboard, images)

## Synthèse

| Domaine | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|
| Sécurité backend | 4 | 10 | 11 | 5 | 30 |
| Workflow E2E | 1 | 4 | 7 | 5 | 17 |
| Dashboard marchand | 4 | 7 | 11 | 10 | 32 |
| Image pipeline | 4 | 6 | 7 | 4 | 21 |
| **TOTAL** | **13** | **27** | **36** | **24** | **100** |

## Corrigé dans ce cycle

| Fix | Sévérité | Description |
|---|---|---|
| C-1 sécurité | Critical | Webhook Resend — never skip signature |
| C-2 sécurité | Critical | Webhook Cloudflare — constant-time comparison |
| C-4 sécurité | Critical | Path traversal — sanitize email attachment filenames |
| Workflow #5 | Medium | available_sizes format — {size,quantity} objects |
| L-3 sécurité | Low | Slug removed from error response |
| C2 dashboard | Critical | window.location.reload() → refetch() |
| C4 dashboard | Critical | Table factures overflow-x-auto mobile |
| H3 dashboard | High | Grid 3 cols for non-POS metrics |
| H4 dashboard | High | Non-POS "Indisponible" badge neutral gray |
| L4 dashboard | Low | Disconnect hover color fix |
| L5 dashboard | Low | Toast role="alert" + aria-live |

**11 fixes appliquées, 3 commits pushés.**

## TOP 10 issues restantes (à traiter cycle 2)

| # | Sévérité | Source | Description |
|---|---|---|---|
| 1 | Critical | Sécurité C-3 | validate N+1 massif — charger tous produits avant la boucle |
| 2 | Critical | Images C1 | processProductImage — pas de timeout sur fetch |
| 3 | Critical | Images C3 | Photo POS changée → photo_processed_url jamais réinitialisé |
| 4 | Critical | Images C4 | createImageJob utilise createClient au lieu de createAdminClient |
| 5 | High | Workflow #3 | /api/stock PATCH — pas de recalculate, feed_events ni Google push |
| 6 | High | Workflow #2 | Promos Shopify silencieusement ignorées (product ID ≠ variant ID) |
| 7 | High | Workflow #4 | Disconnect POS — produits visibles avec stock figé |
| 8 | High | Sécurité H-1 | categorize sans rate limiting — appels LLM illimités |
| 9 | High | Sécurité H-9 | Rate limit fail-open si Upstash down |
| 10 | High | Images H1 | Cron images 1x/jour batch 50 — backlog non drainable |

## Issues par domaine (résumé)

### Sécurité — 19 restantes
- Rate limiting incomplet (categorize, enhance, validate sans limite)
- Input validation manquante (page_type, selected_size, photo_url PATCH, merchant_ids)
- CSP unsafe-inline + unsafe-eval
- console.log données métier en prod
- SELECT * exposant champs internes

### Workflow — 12 restantes
- groupVariantsByEAN jamais appelé pour non-POS
- catalog/import ne génère pas de feed_events
- Clictill/Fastmag sans webhooks (polling only)
- EAN-8 traités comme "sans EAN"
- fuzzyMatched compteur doublé

### Dashboard — 21 restantes
- Onboarding checklist dupliquée (page.tsx + onboarding-checklist.tsx)
- window.confirm() natif (bloqué sur iOS PWA)
- Email inbound step toujours unchecked
- Bulk publish séquentiel sans feedback
- "Tout est OK" ne persiste pas en DB
- RecapPage titre identique sur 3 onglets

### Images — 13 restantes
- Rate limiter UPC non partagé entre instances
- Cron 1x/jour trop lent
- OG metadata utilise photo brute
- Shopify photo produit pas variante
- R2 sans Cache-Control
