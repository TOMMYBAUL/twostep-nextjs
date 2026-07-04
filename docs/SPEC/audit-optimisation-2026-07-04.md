# Audit d'OPTIMISATION des 9 maillons + re-challenge complétude + carte NearSt à jour — 2026-07-04

> Session d'orchestration (Opus) + fan-out **9 agents Fable 5** (1/maillon, code+tests lus) +
> 1 agent recherche NearSt à jour. **Plus profond que l'audit correctness du 2026-07-03**
> (`audit-maillons-2026-07-03.md`) : ici perf, fiabilité, coût, robustesse, UX, dette — ET les
> bugs correctness que le 1er audit a manqués. **Vérif adversariale par l'orchestrateur : 8
> bugs relus sur le code réel, 8 confirmés, 0 réfutation** → les agents sont fiables, les items
> non relus sont marqués `[Fable]` (haute confiance), les relus `[CONFIRMÉ]`.

---

## 0. TL;DR — ce qui a changé depuis le 03-07

1. **Le verdict « aucun maillon ne manque » est PÉRIMÉ.** La recherche NearSt à jour révèle **2 capacités structurelles** non cartographiées (plateforme/API partenaires ; couche transactionnelle) → §1.
2. **13 bugs correctness manqués par le 1er audit**, dont **6 pilote-bloquants** (self-serve cassé, feed qui ment) → §2 (P0).
3. Une **classe systémique** confirmée : **troncature silencieuse à 1000 lignes** sur ≥4 lectures non paginées (la classe LESSONS `max-rows`, fermée côté feed, restée ouverte ailleurs) → §3 cluster B.
4. **~110 optimisations** priorisées impact×effort, dont des **fuites de coût API récurrentes** (enrichissement) et la **fiabilité du chemin de publication Google** avant le pilote → §3–§4.

---

## 1. VERDICT COMPLÉTUDE (objectif 1) — NON, la carte n'est pas complète

Recherche 2026-07-04 (5 sous-agents, `developers.near.st` **vérifié en direct** ; Firecrawl HS ; pricing SPA non scrapable).

### 1.1 — Deux capacités STRUCTURELLES manquantes
- **M10 candidat — Plateforme / API partenaires (moat distribution B2B2B).** NearSt expose un vrai developer platform public : **Partner API** REST (retailers/stores/inventory/products/**Channels** Google+Meta+LocalAds+custom / **Webhooks** « live feed of stock » / **Analytics** / **Insights** / Sandbox), **Ship-from-Store API** (beta, order-routing géoloc), **Product Locator API + widget embeddable** first-party, Inventory Connect (Shopify/Woo, FTP+HTTP). NearSt est une **infrastructure que des éditeurs POS/agences embarquent** (ex. OpSuite by RMS), pas un simple distributeur. **Nos 9 maillons = pipeline interne à 1 output ; aucun ne modélise « infra réutilisable par des tiers ».**
- **Couche transactionnelle (OMS léger).** Product **Reservations** (réserver/payer-retirer) + **Local Checkout** (transaction en ligne, ~**1 % + 10-20p/transaction**), file de commandes dans le dashboard. Monétisation à la transaction. **Nos maillons s'arrêtent à la VISIBILITÉ.** ⚠️ **Possiblement hors-wedge Two-Step** (visibilité ≠ commerce) — **décision stratégique Thomas** (§5).

### 1.2 — Extensions de maillons existants (enrichir la matrice, pas des maillons neufs)
Delivery productisé + vertical c-store/forecourt (Uber/JustEat/Deliveroo, cas Pricewatch +913 %, **opèrent en FR**) · canal **agence/revendeur white-label (DAC Group)** · dépendance **RFID Chainlane** amont (⇒ confirme notre thèse fiabilité : NearSt n'a pas résolu le comptage physique) · posture **AI-local-search** (blog mai 2026, thought-leadership, pas un canal actif).

### 1.3 — Corrections chiffrées de la matrice
- Intégrations POS : **150+** (CEO, fév. 2025). « 800k PdV » = base adressable des éditeurs, **pas** clients directs NearSt.
- **Funding : tour de croissance non divulgué (Bright Minds Capital, 19 fév. 2025)** — contredit « rien depuis 2021 ».
- « Trusted Google Partner » + ads « from £2/day » = **auto-déclaré blog, non re-confirmé côté Google 2026**.
- **Pricing NON CONFIRMÉ** (sources contradictoires £49/£29/$9/$79). → tâche recon chrome-devtools (§4).
- NON trouvé (ne pas inventer) : price-tracking, forecasting/réappro, loyalty, copilot IA, app staff, SOC2/PCI, nouvelle géo.

---

## 2. P0 — BUGS CORRECTNESS MANQUÉS (à traiter avant/autour du pilote)

> Le 1er audit a couvert le point de sortie feed ; ces 13 vivent en dehors (self-serve, app conso,
> RPC delta, enrichissement, lectures non paginées). `[CONFIRMÉ]` = relu par l'orchestrateur.

### Pilote-bloquants (self-serve impossible / feed qui ment)
| # | Bug | Preuve | Fix | Conf. | Eff |
|---|-----|--------|-----|-------|-----|
| P0-1 | **Wizard POS = 404** : cartes « Choisir une caisse » → `/api/pos/{id}/connect` (route inexistante) ; « Forcer sync »/« Déconnecter » → `/api/pos/{prov}/sync\|disconnect` (réel = `/api/pos/sync\|disconnect`). Parcours onboarding = cul-de-sac. | `dashboard/stock/pos/page.tsx:200`, `actions.tsx:22,38` ; routes réelles `[provider]/auth`, `pos/sync`, `pos/disconnect` | Cartes → fetch `[provider]/auth` puis redirect (`use-pos.ts:35`) ; actions → routes sans provider ; test route-contract | **[CONFIRMÉ]** | S |
| P0-2 | **`inbound_email_slug` NULL pour tout marchand créé après migration 057** → aucune adresse email-in (factures ET `stock-{slug}@`) : canal FR mort en self-serve. | trigger `012_slugs.sql:40-47` (pose `slug` seul) ; insert `merchants/route.ts:125-139` ne le pose pas ; `email/inbound-address/route.ts:19` → `null` | Étendre le trigger 012 (`inbound_email_slug = slug`) + backfill NULL | **[CONFIRMÉ]** | S |
| P0-3 | **`/api/products` (écran « Mon stock » E3) non paginé → tronqué à 1000** : compteurs total/ruptures/dispo faux, catalogue paraît amputé (marchand ré-importe en panique). | `api/products/route.ts:43-56` (`.select("*,stock(quantity)").order("name")`, 0 `.range()`) | `fetchAllRows` keyset `order("id")` | **[CONFIRMÉ]** | S |
| P0-4 | **Surfaces conso (discover/favoris/recherche/boutique) court-circuitent M5** → « Stock vérifié » (vert) sur stock `manual`/périmé pendant que la page produit dit « probable » et Google « out of stock » = 3 vérités. Le mensonge fermé côté Google le 03-07, **resté ouvert côté app.** | `stock-badge.tsx:11,60` ; `api/favorites/route.ts:20` ; `api/discover/route.ts:67` ; `product-card.tsx:99` ; qty fabriquée `?? 99` `infinite-product-grid.tsx:130` | Ajouter source/source_ts/updated_at aux SELECT ; StockBadge/ProductCard consomment `state` M5 ; supprimer `?? 99` | **[Fable]** | M |

### Feed / stock (corrige la promesse d'exactitude)
| # | Bug | Preuve | Fix | Conf. | Eff |
|---|-----|--------|-----|-------|-----|
| P0-5 | **Mode `delta` fait RECULER `source_ts`** → neutralise la garde temporelle : un delta webhook retardé rouvre la porte à un REPLACE périmé qui écrase une vérité plus fraîche (+ fraîcheur M5 recule). | `104_stock_source_tracking.sql:46-57` (garde `:50-52` dans le `ELSE` seul ; UPDATE `:57` écrit source_ts inconditionnel) | `source_ts = GREATEST(v_prev_ts, p_source_ts)` en delta | **[CONFIRMÉ]** | S |
| P0-6 | **`feed_events` fantômes** : RPC ne dit pas si l'écriture a été skippée → webhook out-of-order émet un `sale`/`restock` mensonger (et `restock` peut notifier des favoris sur un non-événement). | `104…sql:50,60` (retourne `v_previous` sans flag) ; `zettle/route.ts:53-57` | RPC retourne `(previous, written)` ; n'émettre que si `written` | **[CONFIRMÉ (structurel)]** | S |
| P0-7 | **`pos-resync` non paginé → dérive de stock jamais guérie au-delà de 1000** produits (le chemin d'auto-guérison, enjeu produit n°1) ; rapporte `ok:true`. + `.limit(5000)` plafonné à 1000 sur les connexions. | `resync-stock.ts:55-59,125-128` | `fetchAllRows` + batch upserts | **[CONFIRMÉ]** | S |
| P0-8 | **GTIN-14 rejeté par un des 2 validateurs → perte d'identité cross-canal** : un GTIN-14 e-invoice retombe en SKU, le même produit via POS en UPC-12 ne matche pas → doublon/masqué. | `identifiers/validators.ts:109-116` (14→invalid) vs `ean/validate.ts:22` (accepte 14) ; `triage.ts:83` | GTIN-14 indicateur 0 ≡ EAN-13 dans `canonicalizeEan` + fusionner les 2 validateurs | **[Fable]** | S |

### Enrichissement (coût + fausse identité)
| # | Bug | Preuve | Fix | Conf. | Eff |
|---|-----|--------|-----|-------|-----|
| P0-9 | **Catégorisation IA : lot 200 > `max_tokens 4096` → JSON tronqué → throw → `failed` sans poser `ai_categorized_at` → boucle de retry infinie** (cron */5) qui brûle des tokens pour tout marchand > ~50 produits. | `ai/categorize.ts:196,114,134,271-275` | Chunk ~30/appel + marquer l'échec | **[Fable]** | S |
| P0-10 | **Convergence multi-source structurellement morte** : `lookupEan` écrit le cache au 1er succès, `collectAllEanSources` court-circuite dessus → 1 seul tier → boost convergence jamais déclenché → EAN obscurs restent `pending` (sous-publication). | `ean/lookup.ts:745` ; `enrichment/multi-source.ts:136-155` ; `score-cascade.ts:63-75` | Une seule collecte multi-source (règle aussi P1-C3) | **[Fable]** | M |
| P0-11 | **Collision SKU cross-marchand : EAN faux adopté/persisté/enrichi** (famille du bug 6/7 photos) : marchand B hérite l'EAN+photo d'un produit du marchand A partageant le même SKU. Plafonné `pending`, mais 1 tap publie une fausse identité. | `enrichment/enrich-product.ts:46-54,62-63` | Scoper le match SKU par marchand + garde longueur SKU ≥ 4 | **[Fable]** | M |

### Latents / dormants
| # | Bug | Preuve | Fix | Conf. | Eff |
|---|-----|--------|-----|-------|-----|
| P0-12 | **`google-status` dédup alertes non paginée → perte du lot > 1000 alertes** (violation `uq_quality_alerts_open`). Dormant (gated `GOOGLE_DISAPPROVAL_ALERTS=1`). | `cron/google-status/route.ts:110-115` | Paginer comme `quality-check:33-37,117-127` | **[Fable]** | S |
| P0-13 | **`/api/google/stats` non paginé → KPI/readiness faux > 1000 produits validés** (faible gravité : n'affecte pas le seuil 11, mais le KPI dashboard ment). | `google/stats/route.ts:37-44` | `fetchAllRows` ou agrégats SQL | **[CONFIRMÉ]** | S |

---

## 3. P1 — CLUSTERS D'OPTIMISATION CROSS-MAILLON (les 3 items les plus rentables d'abord)

### Cluster A — Fiabilité + coût du chemin de PUBLICATION Google *(prérequis pilote live)*
Racine commune : le chemin de sortie n'est ni ciblé, ni résilient, ni incrémental.
- **A1 [H×S] Webhook pousse TOUT l'inventaire à chaque vente** (M1#3 = M6#1, **confirmé par 2 agents**). `productIds` existe déjà (`inventory.ts:105-107`), les ids touchés sont en main. 5k SKU × 100 ventes/j = 500k appels/j → ~200. **Fix trivial, à faire avant le pilote.**
- **A2 [H×M] Aucun backoff/retry 429/5xx Google** — `merchant.ts:148-151`, grep backoff=0. Un rate-limit sur le catalogue pilote = run « partial » massif. Retry borné exp+jitter+Retry-After.
- **A3 [H×M] Push séquentiel 1-par-1** (~900-2700 produits/run 270s) — `feed-push.ts:92-99`. Pool concurrence bornée 8-16.
- **A4 [H×M] Pas de diff incrémental (full re-push nocturne)** — `cron/google-feed:122-139`. Watermark `updated_at>last_feed_at` + full hebdo. **Dissout la dette « chunking M7 ».**
- **A5 [H×M] Pas de checkpoint/reprise → FAMINE de la queue** (pas « publié au run suivant » comme le prétend la spec : un run interrompu redémarre à id=0 et re-pousse la tête). Persister `last_feed_cursor`.
- **A6 [M×S] Pas de timeout fetch Google** (`merchant.ts:139-146`) + **A7 [M×S] `refreshGoogleToken` confond blip et révocation** → faux « reconnect required » (`merchant.ts:80`).

### Cluster B — Classe « troncature silencieuse à 1000 » *(sweep systématique)*
Confirmée réelle sur `products` (P0-3), `pos-resync` (P0-7), `stats` (P0-13), `google-status` (P0-12) + listes marchands (`google-feed:29`, `google-status:28`). **Tâche transverse** : auditer TOUT `.select()` sur products/connections/alerts sans `fetchAllRows`/`.range()`, + ajouter `maxPages` fail-loud à `paginate.ts:108,176` (dette anti-boucle-infinie). *Critère « fait » : grep des SELECT non bornés = 0 hors listes courtes documentées ; test 1500 lignes → 1500 traitées sur chaque chemin.*

### Cluster C — Fuites de COÛT API enrichissement *(récurrent, gros $)*
- **C1 [H×S] Pas de cache négatif** → EAN introuvables ré-enrichis en boucle (cron 2h × 4 lookups + Serper + vision pour un résultat nul). ~80 % du spend récurrent. Ligne `ean_lookups(source='not_found')` TTL 30j + sélecteur qui exclut les tentatives récentes. `ean/enrich.ts:22`.
- **C2 [H×S] Serper brûlé à 100 % quand `ANTHROPIC_API_KEY` absente** (état prod, vérif fail-closed) → achat de crédits pour 0 image publiée. Short-circuit en tête de `searchProductImage`. `serper.ts:264-276`.
- **C3 [H×M] Double cascade externe/produit** (`lookupEan` 4 sources séq puis `collectAllEanSources` 4 sources //) → ÷2 appels + corrige P0-10. `enrich-product.ts:42,96`.
- Aussi : C4 chunk categorize (=P0-9), C5 worker throughput (p-limit), C6 KicksDB/GPC sans cache, C7 rate-limiters in-memory par instance, C8 photo Serper jamais backfillée dans `ean_lookups`, C9 vision Anthropic-only (jusqu'à 15 appels/produit → cap 3 + fallback Gemini Flash).

### Cluster D — Complétion self-serve onboarding *(débloque le marchand sans supervision)*
P0-1 (wizard) + P0-2 (slug) + **D1 [H×M] exposer token + `push_url` + adresse `stock-{slug}@` dans l'UI** (aucun consommateur de `/api/ingest/token` dans `src/` — écran « Pousser mon stock » : adresse, token masqué+copier, `example_curl`, fraîcheur, régénérer) + **D2 [H×M] Clictill/Fastmag dans le wizard** (formulaires existent dans settings, absents de l'onboarding) + **D3 [M×M] readiness Google dans la checklist** (seuil offres + GBP lié, `pilot-readiness.ts:58`).

### Cluster E — Intégrité données & honnêteté produit
- **E1 [H×S] Anti-abus signalements : compter les reporters DISTINCTS** — aujourd'hui 1 compte = 3 clics force « Épuisé » 48h. Index unique `(product_id,reporter_id,reason)` + `distinct`. `migrations/095`, `reports.ts:13-14`.
- **E2 [M×M] `UNIQUE (merchant_id, ean)` partiel** (M2#3 = M4#6) — la classe doublon reste possible en DB. Migration dédup + index unique partiel.
- **E3 [H×M] Brancher M5 sur les surfaces conso** (= P0-4).

### Cluster F — Perf sync POS *(risque timeout au 1er gros sync pilote)*
- **F1 [H×S] Enrichissement inline dans le sync → file `enrichment_jobs`** (infra déjà là) — sinon 1er sync 10-30s/produit > lock 10min + budget Vercel. `sync-engine.ts:359-371`.
- **F2 [H×S] Index + scoping `pos_item_id` par marchand** (seq scan/vente + tranche la dette multi-tenant). `resolve-product.ts:40-43`.
- **F3 [H×M] Batcher les writes par-produit** (O(N) round-trips) `sync-engine.ts:249-295`. **F4 [H×M] `groupVariantsByEAN` dirty-check** (relit+réécrit tout à chaque sync) `sync-engine.ts:606-737`.

### Cluster G — Valeur produit type NearSt *(ce qu'ils VENDENT, on ne l'a pas)*
- **G1 [H×M] Métrique SLA « % offres fraîches/publiables par marchand »** — données déjà en mémoire dans `quality-check` (coût ~0), tuile dashboard + historique 7j. Argument commercial pour le pilote.
- **G2 [M×M] Historique de qualité du feed** (`google_feed_runs` : served/pending/disapproved/top-N) — feed-quality report type NearSt, aujourd'hui jeté dans une réponse HTTP non lue. `cron/google-status:145-150`.

> **Top 3 session (impact×effort×proximité pilote)** : **(1) Cluster A1** (webhook push ciblé, H×S, avant tout pilote) · **(2) P0-1+P0-2** (self-serve débloqué, 2×S) · **(3) Cluster C1+C2** (stopper l'hémorragie coût enrichissement, 2×S).

---

## 4. Backlog par maillon (référence complète)

> Listes détaillées (impact/effort/preuve/action/critère) par maillon dans le fichier de travail
> de session ; reportées ici en synthèse. Chaque maillon a rendu son top-3 et sa table complète.

- **M1 Collecte** (0 bug franc ; 15 optim) : top = F1 enrichissement→queue, F2 index pos_item_id, A1 push Google ciblé.
- **M2 Identité** (P0-8 ; 12 optim) : top = fuzzy O(N×M×L²) précompute+pré-filtre longueur, lookups ciblés vs index complet, fusion validateurs.
- **M3 Enrichissement** (P0-9/10/11 ; 17 optim) : top = C1 cache négatif, C2 short-circuit Serper, C3 cascade unifiée.
- **M4 Stockage** (P0-5/6 ; 12 optim + design RPC) : top = RPC batch `replace_stock_snapshot` (garde temporelle atomique), verrou `/api/catalog/import`, fix delta GREATEST. **Design RPC prêt** (INSERT…SELECT jsonb ON CONFLICT WHERE source_ts<=EXCLUDED, RETURNING → compteurs honnêtes, supprime la limite URL `.in()`).
- **M5 Confiance** (P0-4 ; 12 optim) : top = brancher M5 conso, E1 reporters distincts, G1 métrique SLA fraîcheur.
- **M6 Google LFP** (P0-13 ; 15 optim) : top = A1 webhook ciblé, A4 diff incrémental, A2 backoff.
- **M7 Scale** (P0-7/12 ; 14 optim) : top = A5 checkpoint/reprise, P0-7 pos-resync paginé, **preuve de charge 10k→50k jamais exécutée** (script seed + mesure durée/mémoire — validerait A3/A4/A5).
- **M8 UI Phase E** (P0-3 + res.ok P0 ; 21 optim ; **DA bleue #4268FF correctement câblée, rien à re-skinner**) : top = paginer /api/products, gater res.ok, coût par interaction (refetch complet + liste non virtualisée). Résidus tokens hors-système : `dashboard.css:4` (`--ts-terracotta:#4268FF` nom menteur → renommer), 2 chips contraste.
- **M9 Onboarding** (P0-1/2 ; 13 optim) : top = réparer wizard, générer slug, exposer token/adresse UI.

*Dette codebase-wide notée : `auth.getUser()` double-destructure non gardée (classe), + `image_jobs`/rembg pipeline mort toujours alimenté (cron 10min, 103 jobs stale).*

---

## 5. RATTRAPAGE NEARST (objectif 3, NON-terrain) — tâches Fable 5 avec critère « fait »

> Mapping sur les 6 chantiers de `00-roadmap-nearst.md`. Toutes exécutables sans marchand.

| Chantier | Écart NearSt | Tâche Fable 5 | Critère « fait » |
|---|---|---|---|
| **3 Qualité prouvée** | SLA fraîcheur affiché | **G1** métrique « % publiable/frais par marchand » + tuile | Dashboard affiche « X % de ton stock est publiable in-stock » + historique 7j ; test parité avec `computeStockConfidence` |
| **3** | Feed-quality report par upload | **G2** table `google_feed_runs` + historique rejets | Un run persiste served/pending/disapproved/top-N ; écran marchand liste les rejets |
| **4 Insights/attribution** *(ce qu'ils VENDENT — on a ~rien)* | Dashboard vues/visiteurs, impressions/clics | Câbler les métriques Google Merchant (impressions/clics/visites) dans un écran insights | `/api/google/insights` renvoie les métriques réelles ; écran dashboard les affiche ; test sur fixture |
| **2 Distribution** | **Product Locator API + widget embeddable** first-party | Widget « trouver en boutique » + endpoint `locate/{barcode}` (on a déjà le feed) | Un `<script>` embeddable rend la dispo locale d'un GTIN ; endpoint testé |
| **2** | Meta Commerce catalog | Générateur de feed Meta Catalog (réutilise la population feed unifiée) | Feed Meta valide généré pour un marchand ; parité population avec Google ; test |
| **1 Ingestion FR** | Clictill/Fastmag one-click | **D2** Clictill/Fastmag dans le wizard onboarding | Connectables depuis le wizard, pas seulement settings ; test route-contract |
| **1** | email-in FR | **P0-2** slug + **D1** adresse `stock-{slug}@` exposée | Nouveau marchand récupère son adresse email-in seul |
| **5 Self-serve** | Onboarding fluide + GBP | **P0-1** wizard + **D3** readiness (GBP lié + seuil offres) dans la checklist | Un tiers onboarde un pilote sans supervision (runbook + écrans) |
| **6 GTM/pricing** | Pricing FR calibré | Recon : re-scraper `near.st/pricing` + `developers.near.st` **via chrome-devtools** (SPA, Firecrawl HS) | Pricing NearSt 2026 confirmé + benchmark vs nos 3 tiers Stripe |
| **NOUVEAU (M10)** | Plateforme/API partenaires + couche transactionnelle | **DÉCISION STRATÉGIQUE THOMAS d'abord** (§1.1) — hors-wedge possible | — (ne pas coder avant arbitrage) |

---

## 6. Ce qui NE bloque toujours QUE Thomas (rappel — hors périmètre session)
Le **pilote live** (M1 = Deerskin + caisse) reste l'unlock ultime : `google-lfp-etat` confirme que Google a tout débloqué (revue en parallèle, vérif par sondage à distance, push Content API possible AVANT Trusted). Ce backlog **arme** le pilote (self-serve réparé, feed fiable, coût maîtrisé) mais ne le remplace pas.
