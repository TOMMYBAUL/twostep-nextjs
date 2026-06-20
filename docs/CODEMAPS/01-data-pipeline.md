# CODEMAP 01 — Data pipeline stock (LE CŒUR)

> Généré le 2026-06-20 — régénérer si >30% du code a bougé

Flux de bout en bout : collecte → identité → enrichissement → stockage atomique → exploitation.

## 1. COLLECTE (4 sources)

### a) POS sync (pull)
`src/lib/pos/sync-engine.ts`
- `syncMerchantPOS(merchantId, provider): Promise<SyncResult>` — orchestre fetch adapter → upsert produits → stock.
- `buildPosStockRows(...)`, `computeOrphanProductIds(...)`, `groupVariantsByEAN(...)`, `recalculateGroupSizes(...)`.
- `src/lib/pos/index.ts` : `getAdapter(provider)` ; `POS_PROVIDERS = [square, shopify, lightspeed, zettle, clictill, fastmag]`.
- Adapters `pos/{square,shopify,lightspeed,zettle,clictill,fastmag}.ts` impl `IPOSAdapter` (`pos/types.ts`).
- `pos/access-token.ts` : `ensureFreshAccessToken`, `getActivePosAccessToken` (refresh OAuth).
```
api/pos/sync -> sync-engine.syncMerchantPOS -> getAdapter().fetchProducts/Stock -> update_stock_atomic
api/cron/pos-resync -> pos/resync-stock.resyncAllMerchantsStock
```

### b) Webhooks POS (push temps réel)
`api/webhooks/{shopify,square,lightspeed,zettle}/route.ts`
```
webhook -> webhook_events idempotence (insert webhook_id)
        -> adapter.parseWebhook -> resolveWebhookProduct(pos_item_id, provider)
        -> updateStockAtomic(..., source="webhook", updated_at)
        -> recalculateGroupSizesAdmin -> pushInventoryToGoogle -> notifyProductFavorites
```
- `pos/resolve-product.ts` : `resolveWebhookProduct(supabase, posItemId, provider)`, `pickUniqueProduct(rows)` (anti-ambiguïté).

### c) Push fichier (ingestion snapshot) — flux le plus sensible
`api/ingest/stock/route.ts` (token-auth, rate-limit 12)
```
POST file (multipart "file" | corps brut)
  -> resolveIngestToken(token)            ingest/token.ts
  -> parseStockFile(buffer)               ingest/parse-stock.ts -> ParsedInvoiceItem[]
  -> sync_lock (ingest_credentials)
  -> ingestStockSnapshot(merchantId, items, admin, {reconcile:true})
```
`src/lib/ingest/snapshot.ts` — `ingestStockSnapshot(...)`:
1. `triageStockItems(items)` (triage.ts) → identité GTIN|SKU, rejette no_identifier/invalid.
2. index produits existants (EAN>SKU>nom) — **LÈVE si lecture échoue** (jamais [] masqué, sinon doublons catalogue).
3. groupage par nom de base (taille retirée, `_sizeSource` = file_column|name_regex).
4. match EAN→SKU→nom ; create/update produit ; **remplace** le stock (snapshot, pas delta).
5. réconciliation : `selectProductsToZero(...)` (reconcile.ts) met à 0 les produits absents du fichier.
- `ingest/token.ts` : `getOrCreateIngestToken`, `rotateIngestToken`, `resolveIngestToken`.
- `ingest/triage.ts` : `isExploitableSku`, `isPlaceholderName`, `triageStockItems → TriageReport`.

### d) Factures / scan
`api/invoices/upload` + `api/invoices/[id]/{validate,activate,cancel}` ; `api/stock/{receive,incoming,cloture}`.
- Parsing : `lib/parser/index.ts` `parseInvoice(...)` → einvoice (Factur-X/UBL/CII) | spreadsheet | claude/gemini fallback.
- `lib/invoice/activate.ts` `activateInvoice(invoiceId)` → crée/maj produits, stock_incoming, redispo.
- `lib/invoice/redispo.ts` `markProductsRedispo(productIds)` (last_redispo_at).
- Scan : `lib/scan/session.ts` `addScan / setLineQuantity / sessionTotalUnits`.
```
facture -> parseInvoice -> invoice_items -> validate -> activateInvoice -> update_stock_atomic(source="invoice")
scan    -> ScanSession -> api/stock/receive -> update_stock_atomic(source="scan")
```

## 2. IDENTITÉ (EAN/SKU)
- `ingest/triage.ts` (entrée fichier) + `enrichment/match-product.ts`:
  `buildProductIndex(...)`, `matchProduct(...) → MatchResult` (MatchType: ean/sku/name/none).
- `ean/validate.ts` checksum GTIN ; `identifiers/validators.ts`.
- Règle nord : **le nom seul n'est JAMAIS une identité d'ingestion**.

## 3. ENRICHISSEMENT (cascade de tiers)
`src/lib/enrichment/cascade-engine.ts` — `runCascade(input: CascadeInput): CascadeOutcome` ; `preflightEan(ean)`.
`src/lib/enrichment/score-cascade.ts` — Tiers (autorité décroissante) :
`tier1_gs1/isbn/cip/gtin_validated > tier_kicksdb > tier2_off/obf/opf/icecat > tier3_google_pc > tier4_clip > tier5_bert > tier6_eansearch`.
- `TIER_SCORES`, `combineTierScores(tiers)`, `SCORE_THRESHOLDS`, `scoreToReviewStatus → validated|pending|masked`, `scoreToVisible`, `buildCascadeOutcome`.
- Sources : `multi-source.collectAllEanSources`, `resolve-ean.resolveAndEnrich`, `gs1.ts`, `kicksdb.ts`, `tier1-sectoriels.ts`, `tier3-google-shopping.ts`, `ai-verify.verifyEanMatch`.
- Image : `clip-pipeline.ts` + `vectorize-client.ts` + `cache-photo-r2.ts` (tier4).
- Produit : `enrich-product.enrichOneProduct(product, admin)`.
```
cron/enrich-products (*/5) -> enrichment_jobs queue -> enrichOneProduct -> runCascade
cron/enrich-ean (*/2h)     -> ean/enrich.enrichNewProducts / enrichProductsWithoutEan
```

## 4. STOCKAGE (atomicité + source tracking)
`src/lib/pos/update-stock.ts` — `updateStockAtomic(supabase, productId, qty, "absolute"|"delta", source, sourceTs?)`.
- Appelle RPC Postgres `update_stock_atomic(p_product_id,p_quantity,p_mode,p_source,p_source_ts)` (migr. 051+104).
- `StockSource = webhook|pos_sync|file_push|scan|invoice|cloture|manual`.
- `stock.source` + `stock.source_ts` tracent la VÉRITÉ source (migr. 104) → confidence honnête.
- Réconciliation snapshot : voir §1c étape 5.

## 5. EXPLOITATION
### Confidence
`src/lib/stock/confidence.ts` — `computeStockConfidence({...}) → StockConfidence`; `StockState=available|probable|out`; `SourceStrength=realtime|snapshot|manual`.
`stock/product-confidence.ts` — `resolveSourceStrength`, `sourceStrengthFromStored`, `productConfidence`.
`stock/reports.ts` — signalements consumer : `downgradeForReports(state, recentReports)` (1→probable, 3→out, fenêtre 48h).

### Sortie Google LFP
`google/feed.ts` `transformProductToGoogle`, `filterEligibleProducts`.
`google/lfp-xml.ts` `buildLfpXml`, `filterFeedEligible`, `escapeXml`.
`google/inventory.ts` `pushInventoryToGoogle(...)` (push qty temps réel).
`google/merchant.ts` `getGoogleAccessToken`, `googleMerchantFetch`.
`google/product-status.ts` `classifyProductStatus`, `summarizeProductStatuses`, `buildDisapprovalAlerts`.
```
cron/google-feed (3h) -> google/feed -> Merchant API products
feed/lfp/[merchantId] -> buildLfpXml -> Google LFP (pull XML)
webhook -> pushInventoryToGoogle (push qty)
cron/google-status (6h) -> product-status -> quality_alerts(google_disapproved)
```
