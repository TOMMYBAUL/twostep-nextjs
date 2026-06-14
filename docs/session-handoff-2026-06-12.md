# Two-Step — Point de reprise session (2026-06-12)

> **But de ce doc** : reprendre EXACTEMENT ici à la prochaine session. État complet,
> ce qui est fait/testé/appliqué, ce qui est bloqué, et le prochain pas précis.

---

## 0. Reprendre en 30 secondes

- **Tout le chantier V1 est commité sur `feat/pipeline-v1-handoff-2026-06-12`, NON déployé.**
- **Migrations 092→095 : APPLIQUÉES en prod** (vérifié live).
- **Tests : 325 verts** (38 fichiers) hors tests DB-live (qui exigent le réseau, bloqué dans le sandbox). **0 erreur de typecheck.**
- Commande de vérif état : `cd twostep-nextjs && npx vitest run --exclude "**/db/**" && npx tsc --noEmit`
- **(A) couche données : FAIT** (commit `927e624`, session 2026-06-12 soir) — voir §5.
- **PROCHAIN PAS = (B) câblage UI visuel** (badge confiance, bouton signaler, alertes qualité, étiquettes, scan-session) : voir §5, validation visuelle par Thomas.

---

## 1. Contexte / objectif

Construire le pipeline d'ingestion stock « zéro faux positif affiché », inspiré de
NearSt : capter le stock de marchands hétérogènes (POS, caisses FR fermées, sans
caisse), l'enrichir avec certitude, l'afficher honnêtement (états de confiance).
Rapport d'audit complet : `docs/rapport-audit-twostep-2026-06-12.md`.
Contrat d'ingestion : `docs/workflow-ingestion-stock.md`.

## 2. Ce qui est FAIT et TESTÉ (14 tâches)

| # | Brique | Fichiers | Test |
|---|---|---|---|
| 1 | Réconciliation décrémentation (garde-fou anti-fichier-partiel) | `src/lib/ingest/reconcile.ts`, `ingest/snapshot.ts` | `tests/ingest-reconcile.test.ts` |
| 2 | États de confiance (Disponible/Probable/Épuisé + « vu il y a X ») | `src/lib/stock/confidence.ts` | `tests/stock-confidence.test.ts` |
| 3 | Étiquettes Code128 + SKU interne (créateurs) | `src/lib/barcode/code128.ts` | `tests/v1-batch.test.ts` |
| 4 | Lecteur Factur-X CII / BT-157 (EAN par ligne) | `src/lib/parser/einvoice-cii.ts` | `tests/v1-batch.test.ts` |
| 5 | Tier GS1 autoritatif (0,99) — câblé cascade | `src/lib/enrichment/gs1.ts` + `cascade-engine.ts` + `score-cascade.ts` | `tests/enrichment-gs1.test.ts` |
| 6 | Tier KicksDB sneakers (0,97) — câblé cascade | `src/lib/enrichment/kicksdb.ts` + cascade | `tests/enrichment-kicksdb.test.ts` |
| 7 | Taille depuis variantes POS structurées (Shopify câblé) | `pos/extract-size.ts` (resolveProductSize), `pos/shopify.ts`, `pos/sync-engine.ts`, `pos/types.ts` | `tests/pos-resolve-size.test.ts` |
| 8 | Monitoring (stock figé / prix aberrant IQR) | `src/lib/monitoring/quality.ts` + `api/cron/quality-check` | `tests/monitoring-quality.test.ts` |
| 9 | Boucle « signaler une erreur » → dégrade confiance | `src/lib/stock/reports.ts` + `api/products/[id]/report` | `tests/v1-batch.test.ts` |
| 10 | Session de scan en lot (cœur logique) | `src/lib/scan/session.ts` | `tests/scan-session.test.ts` |
| 11 | Cold-start + classification ITF-14 | `src/lib/onboarding/cold-start.ts`, `src/lib/barcode/classify.ts` | `tests/v1-blindspots.test.ts` |
| 14 | Re-sync cron stock (fix dérive retours) | `src/lib/pos/resync-stock.ts` + `api/cron/pos-resync` | `tests/pos-resync-stock.test.ts` |

**Workflow d'ingestion NearSt** (push fichier sans session, par jeton) :
`src/lib/ingest/{snapshot,parse-stock,token}.ts`, `src/lib/ean/validate.ts`,
routes `api/ingest/stock` + `api/ingest/token`. Test `tests/ingest-parse-stock.test.ts`.

**Sécurité (code) appliquée** : fix fail-open `api/cron/closing-reminders`, fix
open-redirect `app/auth/login/page.tsx`.

## 3. Migrations (APPLIQUÉES en prod, vérifiées)

- `092_security_hardening.sql` — REVOKE EXECUTE anon/authenticated sur 6 RPC + gardes
  d'ownership sur create_product_with_stock/receive_stock_incoming + search_path
  claim_signup_slot. **Vérifié live.** Section spatial_ref_sys RETIRÉE (incorrigible
  sans supabase_admin → ticket support, tâche #13).
- `093_ingest_credentials.sql` — jetons de push.
- `094_quality_alerts.sql` — alertes monitoring.
- `095_stock_reports.sql` — signalements consommateur.
- `096_review_status_values.sql` — **APPLIQUÉE 2026-06-13** : élargit le CHECK de
  review_status à pending/masked (bug latent 081 vs 089, découvert par le e2e —
  toute création produit du pipeline violait la contrainte en prod avant ça).

## 4. Crons ajoutés (`vercel.json`) — actifs après déploiement
- `/api/cron/pos-resync` toutes les 6 h (fix retours).
- `/api/cron/quality-check` quotidien 5h.

## 5. PROCHAIN PAS — câblage UI

**(A) Couche données — FAIT (commit `927e624`) :**
1. ✅ Filtre cold-start : `shouldShowOnMap` appliqué dans `api/nearby` (filtre sur
   `product_count` du RPC) et `api/feed` (réutilise `get_merchants_nearby` comme
   source de vérité, fail-open si le RPC annexe échoue, curseur calculé sur les
   données brutes). Choix : filtre côté API, PAS de migration RPC → zéro impact
   prod avant déploiement.
2. ✅ Confiance injectée : nouveau `lib/stock/product-confidence.ts` (pur, 11 tests)
   = `resolveSourceStrength` (pos_item_id→realtime, jeton ingest→snapshot, sinon
   manual) + `computeStockConfidence` + `downgradeForReports` (fenêtre 48 h,
   `REPORTS_WINDOW_H` dans `reports.ts`). Champ `confidence {state,label,
   freshnessLabel}` ajouté aux réponses de `api/products/[id]`, `by-merchants`
   (vitrine boutique, batch + client admin pour RLS) et `by-ean` (scan marchand).

**(B) À construire mais VALIDATION VISUELLE par Thomas (pas de navigateur côté IA) :**
3. Badge confiance sur fiches produit/boutique.
4. Bouton « signaler une erreur » → POST `api/products/[id]/report` (existe).
5. Vue alertes qualité dashboard marchand (lire `quality_alerts`).
6. Bouton « générer étiquette » Code128 (`renderCode128Svg`) pour créateurs.
7. Composant scan-session caméra (au-dessus du scanner existant + `lib/scan/session.ts`).

## 5ter. Workflow d'ingestion fichier FINAL (session 2026-06-12 nuit)

Décision Thomas (alignée NearSt) : **identité = GTIN checksum valide OU SKU ;
le nom seul n'est JAMAIS une identité d'ingestion.**

- `lib/ingest/triage.ts` (NOUVEAU, pur, testé) : tri GTIN (fort, enrichissable) /
  SKU (faible, masqué jusqu'à complétion ; EAN au checksum faux = SKU) / rejeté
  (compté + échantillonné, jamais silencieux). SKU 3-32 chars (PLU courts ok).
- `ingestStockSnapshot` : triage intégré, matching EAN→SKU→nom, option `dryRun`
  (simulation complète pour wizard : créations/màj/passages à 0, zéro écriture),
  rapport `triage` dans le résultat.
- **Angles morts corrigés** : (1) UPDATE forçait `visible:true` → ressuscitait les
  produits masqués/soft-deleted — supprimé ; (2) EAN deviné (par nom ou SKU partagé)
  pouvait auto-publier → plafonné à la file 1-tap `pending` ; (3) fichier 100% rejeté
  + petit catalogue (<10) → réconciliation aurait vidé la boutique — bloquée ;
  (4) produits `validated` re-scorés/dépubliables par un push — figés ;
  (5) recherche nom/photo sur placeholders "EAN x"/"REF x" → bruit — skippée ;
  (6) caps parse : quantité ≤ 9999, prix >0 et <100k sinon null.
- `api/catalog/import` RÉÉCRIT : cœur partagé (parseStockFile+ingestStockSnapshot,
  fini la duplication), `mode=preview` (wizard) / `apply`, dedup hash sur apply
  seulement, 422 + rapport si 0 ligne exploitable. ⚠️ Changements de comportement :
  réconciliation désormais ACTIVE sur ce canal (gardée), et plus de fallback IA
  sur les en-têtes exotiques (déterministe ; l'UI wizard devra afficher l'échec).
- `api/ingest/stock` : 422 + rapport triage si 0 exploitable, status `partial` si
  rejets, rapport triage dans chaque réponse.
- UI restante (chantier B) : écran preview→confirm dans my-stock-view (l'API est
  prête), vue "produits à compléter" (les SKU-only attendent en masked/pending).

## 5quater. Audit exigeant + durcissement (session 2026-06-13)

4 audits à charge (sécurité/archi/fuites/ops). Findings vérifiés EN LIVE (pas sur
la foi du code) puis corrigés. Migrations 097-101 appliquées en prod par l'IA
(Thomas n'applique plus à la main — il pull seulement).

**VAGUE 1 — Sécurité (faite, vérifiée live) :**
- RLS `products`/`stock`/`merchants` étaient `USING(true)` depuis 001. merchants
  fuyait user_id/siret/stripe/inbound_email_slug via clé anon ; products/stock
  = bombe à retardement (catalogue privé fuit au 1er marchand avec pending/masked).
  Fix 097 (policies + column-grant anon) + 098 (fonction SECURITY DEFINER
  `auth_owns_merchant`, car le REVEKE cassait les sous-selects de policy).
- 099 : drop des overloads RPC géo obsolètes → PGRST203 résolu (/api/feed,
  /api/products/discover, /api/feed/promos étaient cassés en prod).

**VAGUE 2 — Scalabilité ingestion (faite, e2e local 8/8 vert) :**
- Enrichissement était SYNCHRONE dans la requête HTTP (10-30 s/produit) → timeout
  garanti dès ~100 produits. Découplé : migration 100 (file enrichment_jobs +
  claim FOR UPDATE SKIP LOCKED), `lib/enrichment/enrich-product.ts` (extrait),
  worker `cron/enrich-products` (*/5, maxDuration 300, batch 10, 3 tentatives),
  snapshot enfile au lieu d'enrichir. Réponse HTTP rapide quel que soit le volume.
- Migration 101 : verrou anti-concurrence (ingesting_since) + idempotence
  (last_file_hash → push identique = no-op). vercel.json : + cron images/process.
- **Bug de gate trouvé+fixé** : `groupVariantsByEAN` publiait les produits
  'pending'/'masked' (stock>0) car isPending ne testait que 'pending_review' →
  court-circuit du "zéro faux positif". Masqué par l'ancien enrichissement inline,
  révélé par le découplage. Fix : visible seulement si review_status='validated'.

**VAGUE 3 — Ops/résilience (faite, 345 tests + tsc verts) :**
- `instrumentation.ts` : `onRequestError` Sentry (crashs de routes remontent enfin).
- `resync-stock` : statut "partial" + captureError si échec d'écriture stock
  (ne masque plus la dérive derrière un "ok").
- `google-feed` : token expiré → statut "error" + Sentry (plus silencieux) ;
  GATE ajouté (visible+validated+!archived+!variant → ne pousse plus de produits
  non identifiés sur Google Shopping) ; statut "partial" si pushed<eligible.
- `quality-check` : watchdog ingestion (last_used_at > 48 h → alerte ingest_silent
  + Sentry) ; check d'erreur sur le SELECT (ne masque plus un échec en "0 produit ok").
  Migration 102 (type ingest_silent + index dédup marchand).
- Backup : `.github/workflows/db-backup.yml` (pg_dump quotidien → artefact 30 j).
  **ACTION THOMAS** : ajouter le secret GitHub `SUPABASE_DB_URL` (Settings → Secrets
  → Actions ; connection directe Supabase port 5432, pas le pooler) pour l'activer.
- `STRICT_DECRYPT` NON activé : 1 token legacy dans pos_connections le casserait
  (migrer via scripts/migrate-encrypt-tokens.mjs avant). Reste à faire.

**Migrations appliquées en prod cette session : 097→102.** quality_alerts UI
(affichage des alertes côté dashboard marchand) reste un chantier B visuel.

**État déploiement** : migrations 097-101 actives sur la DB prod (partagée).
Prod APP = ancien code (branche non mergée) → a encore le bug gate, mais base
quasi vide donc pas d'exposition. e2e validé en LOCAL (le preview manque
CRON_SECRET pour tester le worker). À merger sur main après validation Thomas.

## 5quinquies. Audit canal Google LFP (2026-06-14) — CŒUR DU PRODUIT

Positionnement décidé (cf. PROJECT-BRIEF §"Positionnement & séquence produit") :
Two-Step = "feed Google LFP as a service" d'abord. Donc le canal LFP EST le produit.
Audit complet (code + Supabase live + Vercel) :

- OAuth Google Merchant : 🟡 OK mais scope `content` seul (pas `business.manage`).
- Génération feed (Voie A Content API + Voie B XML) : 🟡 champs OK, mais **2 store_code
  divergents** (Voie A `twostep-{id8}` vs Voie B `slug`).
- Push stock temps réel : 🔴 était CASSÉ — `inventory.ts` envoyait `availability:
  "in_stock"` (underscore) = rejet silencieux Google. **CORRIGÉ → "in stock"**.
- last_feed_status='partial' violait la CHECK 037 → **CORRIGÉ migration 103**.
- Association store_code ↔ Google Business Profile : 🔴 **TOTALEMENT ABSENTE**
  (pas de scope, pas de colonne, pas d'API). LFP l'exige. Gros chantier à venir.
- Observabilité : 🔴 pas de lecture `productStatuses` → on ignore si Google
  accepte/rejette. À construire.
- Vercel : env Google présents, cron google-feed 1×/jour (à passer 15 min plus tard).
- Supabase : 0 connexion Google active.

**FAIT ce jour** : les 2 fixes triviaux/critiques (availability + CHECK partial).
**RESTE (différé jusqu'à avancée Google)** : association GBP (scope+colonne+flux),
store_code unifié+réconcilié, lecture productStatuses, cron 15 min.

**GOULOT RÉEL = candidature LFP côté Google EN LIMBO** : tickets 5-9519000040422 /
6-7242000040976, Merchant Center 5755722759. Le support renvoie vers l'équipe
onboarding LIA "sous 1-2 jours" depuis le 17/04 — ~2 mois sans contact spécialiste.
Questions de Thomas (recrutement parallèle, formulaire formel, vérif FR) sans réponse.
**À clarifier (incertitude) : a-t-on besoin du programme "LFP Data Provider"
(validation bloquée) OU le modèle "Local Inventory par marchand" (chaque marchand
sur son propre Merchant Center via OAuth content qu'on a déjà) suffit-il pour
démarrer sans attendre Google ?** Cette distinction peut débloquer tout le produit.

## 6. BLOQUÉ sur Thomas

- **#12** : GS1 (entreprise devient diffusable sous 24h après 2026-06-12, puis adhésion
  + clé `GS1_CODEONLINE_API_KEY` dans Vercel) ; **clé KicksDB FREE** (1000 req/mois, 2 min,
  gratuite — `KICKSDB_API_KEY`) ; vérifier `CRON_SECRET` + mettre `STRICT_DECRYPT=true` ;
  **repo privé** (optionnel, je perds l'accès) ; **e2e ingestion** après déploiement.
- **#13** : ticket support Supabase (déplacer postgis hors schéma public / RLS
  spatial_ref_sys). Basse priorité (vérifié : géo en `geography`/4326 sans ST_Transform
  → impact réel quasi nul, mais anon a droits écriture sur la table).

## 7. Findings non encore traités (à décider)

- **Retours Shopify/Lightspeed** : leurs webhooks ne captent que la VENTE (décrément).
  Le cron #14 (pos-resync 6h) corrige la dérive — OK pour V1. Fix « temps réel » des
  retours (webhook refunds/create Shopify) = optionnel, le re-sync suffit.
- **SIRET non-diffusible** : `api/auth/verify-siret` échoue silencieusement pour une
  entreprise non-diffusible → ajouter un message dédié à l'onboarding marchand.
- **#10 caméra multi-codes** : le vrai MatrixScan (zxing-wasm, plusieurs codes/image,
  iOS) demande la dépendance `zxing-wasm` + test navigateur. Cœur (session) fait.

## 7bis. Inventaire clés API (audit Vercel prod, 2026-06-12 soir)

**Présentes en prod** : SERPER (tier3 Google 0,95 + images), EAN_SEARCH (tier6 0,90),
REPLICATE (CLIP 0,92), CLOUDFLARE_API_TOKEN+VECTORIZE, GROQ, RESEND +
CF_EMAIL_WEBHOOK_SECRET (email entrant `factures-{slug}@` ACTIF), Upstash,
Stripe (3 price IDs Pioneer/Early/Standard), CRON_SECRET ✅ (le doc demandait de vérifier).

**Absentes de prod mais utilisées par le code** (présentes en `.env.local` seulement) :
- `ANTHROPIC_API_KEY` → fallback parser factures + haiku-product-meta MORTS en prod.
- `GEMINI_API_KEY` → fallback parser Gemini MORT en prod.
- `UPCITEMDB_API_KEY` → tier lookup EAN inactif en prod.
- `INSEE_API_TOKEN` → **verifySIRET est fail-open sans token : en prod, N'IMPORTE QUEL
  SIRET à 14 chiffres passe sans vérification INSEE** (lib/siret.ts:17-20).
- `STRICT_DECRYPT` absent (attendu — rollout en 5 phases, cf. LESSONS).
- `KICKSDB_API_KEY` / `GS1_CODEONLINE_API_KEY` : nulle part (blocage #12).

**Décision recommandée** : KicksDB FREE tout de suite (gratuit) ; GS1 différé jusqu'à
mesure du gap réel via la télémétrie cascade (% produits <0,95 que GS1 débloquerait) —
leçon builder-bias. Les abonnements existants (Serper/EAN-search/Replicate) sont
complémentaires, pas concurrents : OFF/Icecat 0,97 et Google PC 0,95 auto-publient déjà.

## 8. État git / déploiement

- Branche : `feat/pipeline-v1-handoff-2026-06-12`, **poussée sur GitHub** (repo
  public TOMMYBAUL/twostep-nextjs — envisager le passage en privé, #12).
- **Preview Vercel DÉPLOYÉ et e2e ingestion 16/16 VERT (2026-06-13)** :
  https://twostep-nextjs-git-feat-21849b-thomasbauland1304-1982s-projects.vercel.app
  (env Supabase scopées branche, ajoutées via API REST — le CLI stdin/positionnel
  corrompt les valeurs, piège documenté). e2e : `scripts/e2e-ingest-preview.mjs`
  (marchand jetable, push CSV mixte, vérif triage/REPLACE/401, nettoyage).
- UI chantier B fait (`6de5919`) : wizard import preview→confirm, badge confiance,
  bouton signaler, raisons à-compléter. **Validation visuelle Thomas en attente.**
- Prod (twostep.fr) = toujours l'ancien code. Prochain pas : merge main après
  validation visuelle. Ne pas repartir sur `main` pour développer.
- Prod DB = migrations 092-095 appliquées ; prod APP = ancien code (les nouvelles
  routes/libs ne sont pas déployées). Additif, pas de casse. L'e2e du push d'ingestion
  exige un déploiement du nouveau code (ou un `npm run dev` local).
