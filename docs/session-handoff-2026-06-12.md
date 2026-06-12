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

## 8. État git / déploiement

- Branche : `feat/pipeline-v1-handoff-2026-06-12` (chantier V1 commité dessus,
  dont couche données `927e624`). **Rien de déployé.** Ne pas repartir sur `main`.
- Prod DB = migrations 092-095 appliquées ; prod APP = ancien code (les nouvelles
  routes/libs ne sont pas déployées). Additif, pas de casse. L'e2e du push d'ingestion
  exige un déploiement du nouveau code (ou un `npm run dev` local).
