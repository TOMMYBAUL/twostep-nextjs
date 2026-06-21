# CODEMAP 02 — API routes (`src/app/api/**`)

> Généré le 2026-06-20 — régénérer si >30% du code a bougé

Format : `route -> lib -> effet`. Toutes sous `src/app/api/`.

## Webhooks POS (push temps réel)
```
webhooks/shopify    -> pos/shopify + resolve-product + update-stock + google/inventory -> stock + Google
webhooks/square     -> pos/square + update-stock + recalculate-sizes -> stock
webhooks/lightspeed -> pos/lightspeed + update-stock -> stock
webhooks/zettle     -> pos/zettle + update-stock -> stock
webhooks/stripe     -> stripe/client -> merchant billing tier (migr 075)
```
Tous : idempotence via table `webhook_events` (insert webhook_id avant traitement).

## Ingest fichier
```
ingest/stock -> ingest/token.resolveIngestToken + parse-stock + snapshot.ingestStockSnapshot -> stock (snapshot+réconcile)
ingest/token -> ingest/token.getOrCreateIngestToken / rotateIngestToken -> ingest_credentials
inbound-email + inbound-email/cloudflare -> parser/* -> invoices (facture par email)
email/inbound-address, email/status -> email/* -> email_connections
```

## POS (OAuth + sync manuel)
```
pos/[provider]/auth, callback, connect-direct -> pos/access-token -> pos_connections (OAuth)
pos/connect, disconnect, status               -> pos_connections
pos/sync   -> pos/sync-engine.syncMerchantPOS -> produits + stock
pos/resync -> pos/resync-stock.resyncMerchantStock -> stock
```

## Factures / Stock / Scan
```
invoices, invoices/upload                       -> parser/parseInvoice -> invoices + invoice_items
invoices/[id], /validate, /activate, /cancel    -> invoice/activate.activateInvoice -> stock + stock_incoming
stock, stock/receive, stock/incoming            -> update-stock (source scan|invoice) -> stock
stock/cloture                                   -> cloture_sessions (migr 072) -> stock
catalog/import                                  -> parser/spreadsheet -> import_staging -> produits
```

## Enrichissement / EAN / Images
```
categorize, autocomplete -> ai/categorize, ai/haiku-product-meta
products/by-ean          -> ean/lookup -> ean_lookups
images/process (cron)    -> images/process + images/jobs -> image_jobs -> photo_processed_url
images/upload, enhance   -> r2 + images/serper
```

## Google Merchant
```
google/auth, callback -> google/merchant.exchangeGoogleCode -> google_merchant_connections
google/disconnect, stats -> google/merchant
feed, feed/lfp/[merchantId] -> google/lfp-xml.buildLfpXml -> XML LFP
feed/promos -> promotions
```

## Cron (déclencheurs Vercel — cf vercel.json)
```
cron/enrich-ean       (0 */2 * * *)  -> ean/enrich -> EAN manquants
cron/enrich-products  (*/5 * * * *)  -> enrichment_jobs -> enrich-product.enrichOneProduct
cron/google-feed      (0 3 * * *)    -> google/feed -> Merchant API
cron/google-status    (0 6 * * *)    -> google/product-status -> quality_alerts(google_disapproved)
cron/pos-resync       (0 */6 * * *)  -> pos/resync-stock.resyncAllMerchantsStock
cron/quality-check    (0 5 * * *)    -> monitoring/quality -> quality_alerts(stock_stale|price_aberrant)
cron/closing-reminders(*/15 * * * *) -> daily-nudges/push-send
cron/cleanup          (0 4 * * *)    -> purge feed_events/jobs (TTL)
images/process        (*/10 * * * *) -> images/jobs
health                (*/5 * * * *)  -> ping
```

## Consumer & Marchand (lecture/écriture app)
```
products, products/[id], /validate, /reject, /report, /bulk-validate -> products/* + stock/reports
products/discover, by-merchants, available-sizes -> RPC products_nearby (migr 015/029/033)
discover, search, nearby, suggestions, intents -> RPC géo + intent_signals (migr 030)
merchants, merchants/[id]/{profile,stats,tips,achievements,intents} -> merchants/*
favorites, follows, push/subscribe, page-views, consumer/preferences -> tables associées
promotions, promotions/[id], shops/[id]/badges, pioneers -> promotions / achievements
```

## Stripe (billing 3 tiers)
```
stripe/checkout  -> stripe/plans + stripe/client -> Checkout session
stripe/portal    -> stripe/client -> portail client
stripe/tier-info -> stripe/plans -> tier courant
```

## Admin
```
admin/merchants, /[id], /consumers, /stats -> auth/require-admin + supabase/admin
admin/onboarding/{queue,csv,enrich,publish,cascade-suggest} -> onboarding/cold-start + enrichment/cascade
admin/clip/{bootstrap-merchant,embed-product}, debug/clip-test -> enrichment/clip-pipeline + vectorize
auth/verify-siret -> siret.ts (INSEE)
```
