# CODEMAP 03 — Base de données (Supabase / Postgres)

> Généré le 2026-06-20 — régénérer si >30% du code a bougé

Migrations dans `supabase/migrations/` (001..106). RLS activé partout (owner = merchants.user_id).

## Tables principales (colonnes clés)

**merchants** (001, +) — `id, user_id→auth.users, name, address, city, lat/lng, pos_type, pos_last_sync, siret_verified, naf_code, has_online_store, acquisition_channel (085/086), billing tier (075), signup_order_rank (076)`.

**products** (001, +) — `id, merchant_id, ean, name, canonical_name (038), brand, sku (047), category, category_id/subcategory_id (041), category_auto, photo_url, photo_processed_url, photo_source (pos|ean|manual 055), pos_item_id, pos_provider (020), purchase_price, slug (012/059), review_status (081/096), identification_score (089), clip_embedding_status (090), channel (087), attributes jsonb (067), archived_at (065), last_redispo_at (073)`.

**stock** (001, +) — `product_id PK, quantity, source (104), source_ts (104), status (066), updated_at`. Écrit via RPC `update_stock_atomic` (051/104).

**pos_connections** (020) — `id, merchant_id, provider (square|shopify|lightspeed|sumup|zettle), access_token, refresh_token, expires_at, shop_domain, extra jsonb, last_sync_at, last_sync_status (pending|success|error), last_sync_error`.

**google_merchant_connections** (037, +) — `id, merchant_id UNIQUE, google_merchant_id, access_token, refresh_token, expires_at, store_code, products_pushed, last_feed_at, last_feed_status, last_feed_error, feed_status partial (103)`.

**ingest_credentials** (093) — `merchant_id PK, token UNIQUE, last_used_at, last_rows, last_status (ok|partial|error)`. Auth du push fichier.

**enrichment_jobs** (100) — `id, product_id, merchant_id, status (pending|processing|done|failed), attempts, error, processed_at`. File cron enrich-products.

**quality_alerts** (094, +) — `id, merchant_id, product_id, type (stock_stale|price_aberrant|stale_sync|+ingest_silent 102|pos_disconnected 105|google_disapproved 106), detail jsonb, status (open|resolved|ignored)`. Index unique 1 alerte open/(product,type).

**stock_reports** (095) — `id, product_id, merchant_id, reporter_id→auth.users, reason (not_in_store|wrong_price|other)`. Signalements consumer → downgrade confidence.

**invoices** (003, +) — `id, merchant_id, source (email|upload|einvoice), status, file_url, file_hash (056), supplier_name, supplier_id (063), kind (074), ux_status (068), parsed_at, validated_at`.
**invoice_items** (003, +) — `id, invoice_id, name, quantity, ean, sku (047), brand (058), status, match_type (005), product_id, validation fields (064)`.

**ean_lookups** (003, 080-084) — `ean PK, name, brand, category, source, photo, telemetry (082), search_by_name (083)`. Cache enrichissement EAN.

**Autres** : `email_connections` (003), `webhook_events` (idempotence 061), `feed_events` (TTL 053), `image_jobs` (021/052), `import_staging` (088), `suppliers` (062), `cloture_sessions` (072), `intent_signals` (030), `categories` (041 tree), `product_tags` (042), `category_corrections` (043), `achievements` (018), `coach_tips` (017), `stock_incoming` (007), `stock_alerts`, `push_subscriptions` (011), `user_favorites`/`user_follows` (008), `page_views` (016), `platform_metrics`, `sizing_preferences` (013), `merchant_stories` (031, drop 039).

## Migrations (numéro → objet)
```
001 schéma initial (merchants, pos_credentials, products, stock, promotions)
002 champs dashboard          003 phase1 (invoices, invoice_items, email_connections, ean_lookups)
004 dédup factures            005 invoice_item match_type
006 précision produit         007 stock_incoming
008 app consumer (favorites, follows)   009 durcissement sécurité
010 ops stock atomiques       011 push_subscriptions
012 slugs                     013 préférences taille
014 avatar_url                015 RPC products_nearby
016 page_views                017 coach_tips
018 achievements              020 upgrade pos_connections
021 pipeline images           022 suggestions
023 product_size              024 fix RLS
025 fix search/filtre stock   026 available_sizes
027 variantes                 028 RPC filtre taille
029 products_nearby filtre taille   030 intent_signals
031 merchant_stories          032 fix filtre taille/stock
033 nearby filtre taille      034 bypass produits sans taille
035 filtre catégorie lowercase 036 fix merchants_nearby RPC
037 google_merchant_connections    038 RPC canonical_name/photo
039 drop stories              040 liens sociaux marchand
041 arbre catégories          042 product_tags
043 category_corrections      044 lowercase products_nearby
045 filtre visible nearby     046 RPC product pos_provider
047 invoice sku + pos types   048 fix coalesce products_nearby
049 fix warnings sécu / spatial_ref_sys RLS   050 sync_lock
051 update_stock atomique     052 image_job_claim
053 feed_events TTL           054 postgis → extensions
055 photo_source serper       056 invoice file_hash
057 inbound_email_slug        058 invoice_items brand
059 RPC add_product slug      060 index stock product_id
061 webhook_events idempotence 062 suppliers
063 invoices supplier_fk      064 invoice_items validation
065 products archived_at      066 stock status
067 products attributes       068 invoice ux_status
072 cloture_sessions          073 products last_redispo_at
074 invoices kind             075 merchant_billing (Stripe 3 tiers)
076 signup_order_rank         080 ean_lookups étendu
081 products review_status    082 ean_lookups telemetry RPC
083 ean_lookups search_by_name 084 ean_lookups category manquante
085 acquisition tracking      086 acquisition_channel check
087 product channel split     088 import_staging
089 products identification_score   090 clip_embedding_status
091 categories RLS lockdown   092 durcissement sécurité
093 ingest_credentials        094 quality_alerts
095 stock_reports             096 review_status values
097 RLS lockdown products/merchants/stock   098 RLS owner helper fix
099 drop overloads geo RPC obsolètes        100 enrichment_jobs queue
101 ingest lock + idempotence 102 quality_alerts ingest_silent
103 google_feed_status partiel 104 stock source tracking (source, source_ts)
105 quality_alerts pos_disconnected   106 quality_alerts google_disapproved
```

## RPC clés (Postgres)
- `update_stock_atomic(p_product_id, p_quantity, p_mode, p_source, p_source_ts)` — écriture stock atomique tracée (051/104).
- `products_nearby(...)` / `merchants_nearby(...)` — recherche géo + filtres taille/visible (015/029/033/036/044/048).
