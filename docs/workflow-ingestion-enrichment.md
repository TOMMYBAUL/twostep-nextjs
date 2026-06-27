# Workflow ingestion stock + enrichissement — schéma & état réel (testé le 2026-06-27)

> Test de bout en bout : 7 vrais codes-barres poussés via `POST /api/ingest/stock` sur le
> marchand « Two-Step Test », enrichissement déclenché via le cron, **photos inspectées
> visuellement**. Ce doc distingue ce qui est **prouvé+vérifié** de ce qui est **cassé**.
> PNG rendu : `docs/workflow-ingestion-enrichment.png`.

## La distinction clé

Les 8 maillons « prouvés » du 22/06 = **le TUYAU** (intégrité de la donnée stock). Ils
ont tous tenu au test. L'**ENRICHISSEMENT** (EAN → photo/marque/catégorie) n'a **jamais**
fait partie de ces 8 maillons, n'a jamais été prouvé en réel, et était déjà **escaladé**
(image_jobs 103 pending depuis avril). C'est lui qui casse.

```mermaid
flowchart TB
  M["Marchand — export caisse"]:::neutral --> CSV["CSV / XLSX<br/>code-barres ; qté ; prix"]:::neutral
  EMAIL["Email-in (maillon 8) — canal alternatif OK"]:::ok
  CSV --> TOK["POST /api/ingest/stock — token Bearer"]:::neutral
  EMAIL -. autre canal .-> TOK

  subgraph ING["INGESTION — le TUYAU (8 maillons prouvés par tests)"]
    direction TB
    P1["1 · Parse + encodage UTF-8/16 · Win-1252 OK"]:::ok
    P2["2 · Triage identité — checksum GTIN vs SKU OK"]:::ok
    P3["3 · Match → products — 0 doublon · idempotent OK"]:::ok
    P4["4 · Réconciliation snapshot — garde anti-push-partiel OK"]:::ok
    P5["5 · Confiance / fraîcheur OK"]:::ok
    P1 --> P2 --> P3 --> P4 --> P5
  end
  TOK --> P1
  P5 --> QTY["Quantités 7/7 exactes · Prix 7/7 OK (virgule FR)"]:::ok

  P3 --> JOBS[("enrichment_jobs · file async")]:::neutral
  JOBS --> CRON["Cron enrich-products · /5 min OK"]:::ok

  subgraph ENR["ENRICHISSEMENT — l'EAU (JAMAIS prouvé en réel · hors des 8 maillons)"]
    direction TB
    CAS["Cascade 6 tiers — GS1·CIP·OBF·OPF·Google·EAN-Search"]:::neutral
    NAME["Nom / identité EAN — 7/7 résolus (bruts) OK"]:::ok
    CATg["Catégorie — 2/7 FR · 4/7 anglais · 1 FAUX"]:::warn
    BRAND["Marque — null 7/7 (CASSÉ)"]:::bad
    IMG["Recherche photo Serper"]:::neutral
    VER["Vérif IA Claude Haiku — ne bloque RIEN"]:::bad
    RES["Photos — 6/7 FAUSSES"]:::bad
    CAS --> NAME
    CAS --> CATg
    CAS --> BRAND
    CAS --> IMG --> VER --> RES
  end
  CRON --> CAS
  RES --> IMGQ[("image_jobs · 103 pending — stale depuis avril · escaladé")]:::stale

  SCORE["Score 0,90 → tout en PENDING — rien ne se publie automatiquement"]:::warn
  RES --> SCORE
  BRAND --> SCORE
  CATg --> SCORE

  P5 --> D6["6 · Affichage honnête read-path — zéro faux rabais / faux-vide OK"]:::ok
  D6 --> D7["7 · Sortie Google LFP — GTIN+prix OK (image relâchée)"]:::ok
  SCORE -. bloque la visibilité .-> D6
  D7 --> GG["Google Shopping / Maps — feed sans photo fiable"]:::warn

  classDef ok fill:#dcfce7,stroke:#16a34a,color:#14532d;
  classDef bad fill:#fee2e2,stroke:#dc2626,color:#7f1d1d,stroke-width:2px;
  classDef warn fill:#ffedd5,stroke:#ea580c,color:#7c2d12;
  classDef stale fill:#e0e7ff,stroke:#6366f1,color:#312e81;
  classDef neutral fill:#f8fafc,stroke:#94a3b8,color:#1e293b;
```

## Verdict par critère (test réel du 27/06)

| Critère | Verdict | Détail |
|---|---|---|
| Quantités | ✅ | 7/7 exactes |
| Prix | ✅ | 7/7 (virgule décimale FR → point) |
| Encodage CSV (Latin-1/accents) | ✅ | fallback Windows-1252 OK |
| Garde anti-push-partiel | ✅ | a protégé les 30 produits existants |
| Nom / identité EAN | ✅ | 7/7 résolus (mais bruts, non nettoyés) |
| Catégorie | ⚠️ | 2/7 mappés FR · 4/7 anglais · 1 faux (Coca→home&garden) |
| Marque | ❌ | null 7/7 |
| **Photos** | ❌ | **6/7 fausses** (colle→pantalon, BBQ→casque, scanner→Ray-Ban…) |
| Vérif IA photo (Haiku) | ❌ | ne rejette pas les images grossièrement fausses |
| Publication auto | ⚠️ | score 0,90 < 0,95 → tout reste en *pending* (revue manuelle) |

## Cause racine probable (à diagnostiquer)

1. **Recherche photo par EAN** : Serper renvoie du bruit (images de pages mentionnant des
   numéros proches). La requête par nom seule (marque=null) est faible.
2. **Vérif IA Haiku** : soit non appelée, soit **fail-open** (accepte sur erreur) → laisse
   passer une colle pour un pantalon. À confirmer dans le code (silent-failure).
3. Le 1 succès (Coca, EAN frais) venait d'un site mettant l'EAN dans le nom de fichier image.
