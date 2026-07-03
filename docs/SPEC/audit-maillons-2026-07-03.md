# Audit des 9 maillons (Fable 5) — 2026-07-03

> 9 auditeurs Fable 5, un par maillon, chacun a **lu le code ET exécuté les tests** (pas du
> déclaratif). Puis correction du cluster de bugs pilote-critiques révélé. Source : confrontation
> SPEC (`docs/SPEC/M1..M9`) vs code réel. Contrôle de complétude vs NearSt : **aucun maillon ne
> manque** (Google/Meta/locator/last-mile déjà cartographiés dans `00-roadmap-nearst.md`).

## Scorecard

| Maillon | Statut réel | Pilote-critique | Preuve |
|---|---|---|---|
| M1 Collecte | 🟢 solide | oui | 135/135 tests |
| M2 Identité | 🟡→🟢 corrigé | oui | 65 tests + fix |
| M3 Enrichissement | 🟡 corrigé en code (non prouvé live) | oui | 73/73 tests |
| M4 Stockage | 🟡 partiel (1 bug différé) | non | tests OK |
| M5 Confiance | 🟡→🟢 corrigé | oui | 34 tests + fix |
| M6 Google LFP | 🟢 solide (bug corrigé) | oui | ~200 tests |
| M7 Scale | 🟢 solide | oui | 62/62 tests |
| M8 UI Phase E | 🟢 logique solide / visuel à faire | oui | helpers testés |
| M9 Onboarding | 🟡 partiel (token UI absent) | oui (contournable pilote supervisé) | routes lues |

## Les 3 vérités transversales (qu'un checklist « fait/pas fait » cache)

**A. Le point de SORTIE (feed Google) contournait les maillons qualité** — 3 auditeurs ont convergé.
Le feed publiait `quantity > 0` BRUT → ignorait confiance (M5), éligibilité complète (M6), garde
temporelle (M4), pagination/fail-loud (M2). = la promesse « exactitude » trahie au point exact de la
sortie. **→ CORRIGÉ (cluster A), voir plus bas.**

**B. Zéro preuve réelle, partout.** Tests verts sur fixtures, mais aucun catalogue marchand réel
ingéré→enrichi→publié→vérifié en Merchant Center. = maillon 6a.4, **gated sur le pilote (Thomas)**.

**C. Onboarding self-serve incomplet (M8+M9).** Token d'ingestion + adresse `stock-{slug}@` non
exposés dans l'UI → un marchand ne peut pas s'onboarder seul. **Contournable en pilote supervisé.**

## Cluster A — corrections appliquées (2026-07-03)

| Fix | Fichier | Correction | Vérif |
|---|---|---|---|
| M2 | `lib/enrichment/match-product.ts` | `buildProductIndex` : `fetchAllRows` keyset + throw fail-loud (fin des doublons >1000 SKU / index vide silencieux) | tsc + tests |
| M6 | `lib/google/inventory.ts` | population alignée feed : +`review_status=validated`/`archived_at null`/`variant_of null` | tsc + tests |
| M5 | `lib/google/feed-availability.ts` (nouveau) + `feed.ts`, `lfp-xml.ts`, `inventory.ts`, 3 routes SELECT | helper pur unique : `availability` = état M5 `available` (source fiable + frais + qty>2) sinon `out of stock`. **4 sorties Google unifiées.** Seuil qty>2 conservateur **validé par Thomas** (stock multi-tailles agrégé sur le parent → n'affecte que fins de série / solos low-stock) | tsc 0 err, 171 tests (revérifiés) |

**Décisions produit gravées** : (1) « in stock » ⟺ M5 `available` (webhook 24 h / snapshot 12 h frais + qty>2) ; (2) offre gardée dans le feed (rebascule), jamais exclue ; (3) qty clampée à 0 si out of stock (anti-inférence Google).

## Reste à faire (trié par pilote)

1. **M4 file-push → RPC temporel** — *non pilote-critique*, plus risqué (chemin d'écriture ingestion), fix design-sensible → **passe dédiée à froid**, pas en fin de session.
2. **M3 preuve e2e photo live** + `categorize.ts` inerte sans clé API — gated env/pilote.
3. **C. Token UI + adresse stock email** — pour le self-serve (contournable en pilote supervisé).
4. **UI finition pro + responsive** (dashboard + site) — chantier actif ouvert le 2026-07-03.
5. **B. Le pilote** (M1 = Deerskin + caisse, Thomas) — l'unlock ultime, tout le reste le sert.
