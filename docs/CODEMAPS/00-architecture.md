# CODEMAP 00 — Architecture

> Généré le 2026-06-20 — régénérer si >30% du code a bougé

Next.js (App Router) + TypeScript + Supabase (Postgres/RLS) + Vercel crons.
Cœur métier : fiabiliser le stock multi-sources et le pousser vers Google LFP.

## Frontières principales (`src/`)

```
src/app/                routes (UI + api)
  (consumer)/           app shopper public : [city]/[category], discover, explore, shop, product, favorites
  (marketing)/          landing, blog, tarifs, marchands
  dashboard/            espace marchand : products, stock(pos|factures|mon-stock|cloture|review), google, promotions, billing, recap
  admin/                back-office : merchants, consumers, onboarding-wizard, debug/clip-test
  auth/                 signup/login/callback/confirm/finalize/billing (Supabase auth + Stripe gate)
  onboarding/           cold-start marchand
  api/**                handlers serveur (cf 02-api-routes.md)

src/lib/                logique métier (cf détails ci-dessous)
src/components/         base/ dashboard/ shop/ stock/ foundations/ shared-assets/
src/hooks/ providers/ styles/ utils/
supabase/migrations/    001..106 (cf 03-database.md)
```

## Modules `src/lib/` (1 ligne chacun)

- `ingest/` — **entrée stock par fichier** : parse-stock, triage (identité EAN/SKU), snapshot (réconciliation atomique), token (auth push), reconcile.
- `pos/` — **sync caisses** : sync-engine, adapters (square, shopify, lightspeed, zettle, clictill, fastmag), update-stock (RPC atomique), resync-stock, resolve-product, access-token, types/index.
- `enrichment/` — **cascade d'identité produit** : cascade-engine, score-cascade (tiers→score→review_status), multi-source, resolve-ean, match-product, ai-verify, gs1/kicksdb/tier1-sectoriels/tier3-google-shopping, clip-pipeline+vectorize (image), telemetry.
- `ean/` — lookup (UPCitemDB/EAN-Search), validate, enrich, rate-limiter.
- `google/` — **canal sortie** : merchant (OAuth+token), feed (transform→Google), inventory (push qty), lfp-xml (flux Local Feed Partner), product-status (disapprovals), store-code.
- `stock/` — confidence (state available/probable/out), product-confidence, reports (signalements consumer).
- `invoice/` — activate (facture→stock incoming→redispo), redispo.
- `parser/` — factures : einvoice (Factur-X/UBL/CII), spreadsheet, claude-fallback, gemini-fallback, index, parse-price.
- `scan/` — session scan code-barres (addScan, setLineQuantity).
- `barcode/` — classify, code128 ; `identifiers/` validators ; `feed/` score.
- `products/` — channel (online/in_store/multi, split ids).
- `monitoring/quality.ts` — détection stock figé / prix aberrant (cron).
- `supabase/` — client/server/admin/middleware. `auth/` — admin guard, state-token, create-merchant.
- `stripe/` — client, plans (3 tiers). `email/` — resend, encryption. `images/` — process, serper, jobs. `merchants/acquisition.ts`. `r2.ts` (Cloudflare R2). `push*.ts`. `ai/` (haiku meta, categorize).

## Flux macro

```
Sources stock ─┬─ POS sync (pos/sync-engine)
               ├─ Webhooks POS (api/webhooks/*)
               ├─ Push fichier (api/ingest/stock → ingest/snapshot)
               └─ Factures/scan (api/invoices, api/stock/*)
   → identité EAN/SKU (ingest/triage, enrichment/match-product)
   → enrichissement (enrichment/cascade-engine)
   → stockage atomique (pos/update-stock RPC, source+source_ts)
   → confidence (stock/confidence) → sortie Google (google/feed, lfp-xml, inventory)
```
Détail complet : voir `01-data-pipeline.md`.
