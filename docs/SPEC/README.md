# SPEC — Contrat auditable des maillons Two-Step

> Créé le 2026-07-01 (Thomas + Opus). **Objet : donner à Fable 5 un référentiel
> falsifiable pour (1) AUDITER chaque maillon déjà construit et (2) RÉALISER les
> maillons restants.** Un audit sans contrat = relecture de code sans référentiel.
> Ce dossier EST le référentiel.

---

## Pourquoi ce dossier existe

L'état réel du projet était documenté dans `autonomy-priorities.md` — un **journal de
run** (1000+ lignes, mêlé d'idle). Excellent pour l'historique, **inutilisable comme
contrat** : on ne peut pas cocher « ce maillon respecte X » face à un journal.

Ce dossier extrait, par maillon, **le contrat** : ce qui DOIT être vrai, les invariants
qui DOIVENT tenir, les preuves qui DOIVENT exister. C'est ce que Fable 5 confronte au
code (audit) et ce qu'il implémente (build).

## La carte des maillons

Le pipeline stock (cf. `docs/CODEMAPS/01-data-pipeline.md`) = 9 maillons :

| # | Maillon | Statut réel | Fichier |
|---|---------|-------------|---------|
| M1 | Collecte (4 sources : POS pull, webhooks, ingest fichier, factures/scan) | construit + testé | `M1-collecte.md` |
| M2 | Identité (EAN/SKU, checksum GTIN) | construit + testé | `M2-identite.md` |
| M3 | Enrichissement (cascade : photo / marque / catégorie / nom) | construit ; **e2e photo non prouvé (env live)** | `M3-enrichissement.md` |
| M4 | Stockage atomique + réconciliation snapshot | construit + testé | `M4-stockage.md` |
| M5 | Confiance / fraîcheur (affichage honnête) | construit + testé | `M5-confiance.md` |
| M6 | Sortie Google LFP (Voie A cron + Voie B XML + inventory + readiness) | construit + testé | `M6-google-lfp.md` |
| M7 | Scale / volume (pagination, streaming, budget temps) | construit ; **1 reste : chunk cron google-feed** | `M7-scale.md` |
| M8 | UI Phase E (écrans marchand honnêtes au chargement) | construit ; **rendu VISUEL/responsive à faire (yeux)** | `M8-ui-phase-e.md` |
| M9 | Onboarding pilote (wizard import + connexion, shadow/preview) | data-backing fait ; **wizard UI à finir** | `M9-onboarding.md` |

## Le template (chaque `Mx-*.md` suit CE format)

```
# Maillon Mx — <nom>

## Rôle
1 phrase : ce que le maillon transforme.

## Contrat I/O
- Entrées sales acceptées : ... (ce qu'on garantit de digérer sans casser)
- Sortie garantie : ... (forme + garanties)

## Invariants nord (TESTÉS — pas des intentions)
Liste numérotée. Chacun : l'invariant + le fichier:fonction qui l'applique + le test
qui le prouve. Ce sont les lignes que l'audit coche/décoche.

## Modes d'échec attendus
Pour chaque échec plausible : le comportement EXIGÉ (fail-loud / fail-closed /
fail-open toléré) + où c'est appliqué. Un `[]` masqué ou un faux « success » = défaut.

## Preuves exigées
- Tests unitaires : fichiers + ce qu'ils prouvent.
- PREUVE RÉELLE (méthode incrémentale) : entrée sale réelle → sortie inspectée champ
  par champ. Qui la produit (boucle sans yeux vs Thomas/Playwright vs env live).

## Statut réel + dette connue
done / gated / todo, et la dette explicite (findings latents, escalades ouvertes).

## Périmètre Fable 5
- AUDITER : quoi confronter au code, quels écarts chercher.
- CONSTRUIRE : ce qui reste, avec la barre de preuve.
```

## Protocole Fable 5

**Phase 1 — AUDIT (maillons `done`).** Pour chaque maillon, pour chaque invariant du
contrat : trouver le code qui l'applique, vérifier qu'un test le prouve, et **tenter de
le réfuter** (entrée qui devrait le casser). Sortie : par maillon, `CONFORME` /
`ÉCART` (avec le cas qui casse) / `NON PROUVÉ` (invariant sans test). Ne PAS réparer en
phase 1 — lister.

**Phase 2 — BUILD (maillons `gated`/`todo`).** Implémenter contre le contrat, avec la
barre de preuve du maillon. Respecter la doctrine projet : impact analysis avant edit,
0 migration prod sans GO, réversible, `test:run` + `tsc` verts, revue silent-failure.

## Barre de preuve — non négociable (la boucle N'A PAS D'YEUX)

1. **Un test vert ≠ une vérité réelle.** Le bug enrichissement (6/7 photos fausses) a
   survécu parce qu'il était « prouvé » sur synthétique. Tout invariant à conséquence
   visuelle ou réseau exige une **preuve réelle inspectée**, pas juste un test.
2. **Ce que le code peut prouver seul** (unit-testable, pur) vs **ce qui exige un env
   live** (clés API + serveur + Supabase) vs **ce qui exige des yeux** (rendu visuel) —
   c'est marqué par maillon. Ne jamais cocher « OK » sur un axe qu'on ne peut pas voir.
3. **Zéro faux positif > couverture.** Inventer une donnée (marque, catégorie, photo)
   est pire que la laisser nulle. `null` honnête bat une valeur fausse.

## Références source (ne pas dupliquer, pointer)

- `docs/CODEMAPS/01-data-pipeline.md` — carte technique du flux.
- `docs/autonomy-priorities.md` — journal + north-star + filtre de cap.
- `docs/workflow-ingestion-stock.md` / `workflow-ingestion-enrichment.md` — les 2 flux.
- `docs/pipeline-state.md` — fil conducteur (où on en est).
- `LESSONS.md` — erreurs récurrentes à ne pas refaire.
