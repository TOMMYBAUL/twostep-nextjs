---
# FIL CONDUCTEUR de la boucle autonome — source de vérité sur « où on en est ».
# La boucle lit CE fichier EN PREMIER (compact) avant les gros docs, et le met à jour
# EN DERNIER à chaque run. Schéma + enum documentés dans docs/os-architecture.md.
pipeline: operation-pilote
step: 1
step_total: 5
step_name: "OPÉRATION PILOTE (mission 2026-07-07, Thomas) : P0 pilote-bloquants restants → armement pilote (runbook, démo réelle, Clictill, kit prospection, dossier Trusted) → insights G1/G2"
status: in_progress
blocked_on: "thomas: voir docs/DECISIONS-EN-ATTENTE.md (10 décisions consolidées, 4 bloquant-pilote dont clé ANTHROPIC + RDV Deerskin)"
next_action: "NOUVELLE MISSION — lire autonomy-priorities.md §1ter (OPÉRATION PILOTE, remplace §1bis/§3 pour le choix du travail) + docs/DECISIONS-EN-ATTENTE.md (exécuter en priorité toute décision cochée par Thomas). Ordre : P0-2 inbound_email_slug NULL (email-in self-serve mort — vérifier l'état réel d'abord, préparer migration NON appliquée) → P0-4 surfaces conso vs M5 (derrière flag) → P1 armement pilote (6a.3 runbook testé à blanc, 6a.2 vitrine démo via pipeline RÉEL, adapter Clictill/Fastmag sur fixtures réelles, 6b kit prospection PRÉPARÉ jamais envoyé, 6c dossier Trusted) → P2 G1/G2 (insights vendables). Durcissement sans signal réel frais = INTERDIT (gate vert, 1277 tests). M10 = hors-wedge, ne pas re-proposer."
branch: feat/pipeline-v1-handoff-2026-06-12
gate: green               # green|red|unknown  (tsc 0 + 1277/1277 tests verts, run 2026-07-06 #2)
last_run: 2026-07-06
last_commit: 220af4e      # feat(google/publication): A5 checkpoint/reprise feed Google + migration 111 (NON appliquée, GATED) (run 2026-07-06 #2)
---

# État — 2026-07-07 : RÉORIENTATION STRATÉGIQUE → OPÉRATION PILOTE

**Audit stratégique du 2026-07-07 (session Thomas + Fable 5).** Constat vérifié en prod :
0 marchand réel depuis le 25/04, 0 connexion Google, 110 image_jobs gelés (clé ANTHROPIC),
pendant que le software atteint 1277 tests et ~90 % de l'audit 07-04 exécuté. **Le goulot n'est
plus le code.** La boucle passe en mission **OPÉRATION PILOTE** (`autonomy-priorities.md §1ter`) :
finir les 2 P0 pilote-bloquants, puis produire l'ARMEMENT du pilote (runbook onboarding testé à
blanc, vitrine démo via pipeline réel, adapter Clictill prouvé, kit prospection, dossier Trusted),
puis les insights G1/G2. Les décisions en attente de Thomas sont consolidées dans
`docs/DECISIONS-EN-ATTENTE.md` (lu à chaque run ; décision cochée = exécution prioritaire).

---

# État resumable — 2026-07-04 : audit d'OPTIMISATION 9 maillons FAIT (complétude re-challengée, carte NearSt à jour)

**Reprise rapide (lire ceci, puis `docs/SPEC/audit-optimisation-2026-07-04.md`).**

- **Audit d'optimisation FAIT** (9 agents Fable 5, 1/maillon, code+tests lus ; + recherche NearSt à jour ;
  8 bugs relus adversarialement par l'orchestrateur, 8 confirmés). Plus profond que l'audit correctness du 03-07.
- **Complétude re-challengée → « aucun maillon ne manque » PÉRIMÉ** : NearSt a 2 capacités structurelles non
  cartographiées — **plateforme/API partenaires** (moat B2B2B, `developers.near.st` vérifié) et **couche
  transactionnelle** (réservations + Local Checkout). ⚠️ possiblement hors-wedge → **arbitrage Thomas**.
- **13 bugs correctness manqués** dont **6 pilote-bloquants** (wizard POS 404, `inbound_email_slug` NULL,
  `/api/products` tronqué 1000, surfaces conso court-circuitent M5, delta `source_ts` recule, feed_events fantômes).
- **Classe systémique confirmée** : troncature silencieuse à 1000 (≥4 lectures non paginées).
- **~110 optimisations** priorisées en 7 clusters cross-maillon (A fiabilité/coût publication Google,
  B sweep troncature, C fuite coût enrichissement, D self-serve, E intégrité, F perf sync POS, G valeur produit NearSt).
- **Aucun code modifié cette session** (audit + livrable seulement) → gate reste green au dernier commit.

**Chantier PRÉCÉDENT (UI finition E)** : toujours ouvert (jugement visuel Thomas, DA bleue #4268FF confirmée
correctement câblée — rien à re-skinner). À reprendre après/avec les P0.

---

# (archive) État — 2026-07-03 : audit 9 maillons FAIT + cluster A corrigé → UI finition

**Reprise rapide (lire ceci, puis `docs/SPEC/audit-maillons-2026-07-03.md`).**

- **Audit Fable 5 des 9 maillons FAIT** (chaque maillon : code lu + tests exécutés). Le socle est
  solide et testé. Complétude vs NearSt : **aucun maillon ne manque**.
- **M3 enrichissement N'EST PLUS « cassé priorité n°1 »** : les 4 casses du 27/06 sont **corrigées en
  code + testées** (vérif photo fail-CLOSED, marque, catégorie FR ; 73/73 tests). Reste : preuve e2e
  photo LIVE (env/pilote) + `categorize.ts` inerte sans clé API.
- **Cluster A pilote-critique CORRIGÉ + VÉRIFIÉ** (2026-07-03) : le feed Google ne publie plus de faux
  « en stock » — M5 (feed↔confiance, helper `feed-availability.ts`, 4 sorties unifiées), M6
  (population/éligibilité `inventory.ts`), M2 (`buildProductIndex` paginé+fail-loud). tsc 0 err,
  tests verts. Détail + décisions produit : `docs/SPEC/audit-maillons-2026-07-03.md`.
- **M4 stockage (file-push → RPC temporel)** : DIFFÉRÉ — *non* pilote-critique, plus risqué, fix
  design-sensible → passe dédiée à froid.

**Chantier ACTIF = UI finition pro + responsive (dashboard + site)**, DA respectée (`docs/brand-guidelines.md`
+ `src/styles/theme.css`, base Untitled UI). Le rendu « pro vs moyen » = **jugement visuel de Thomas**
(la boucle ne coche pas « UI OK » seule) → boucle captures/revue nécessaire. Gaps M8/M9 à traiter dans
la foulée : token d'ingestion + adresse `stock-{slug}@` non exposés dans l'UI (self-serve).

**L'unlock ultime reste le PILOTE** (M1 = Deerskin + caisse, Thomas) — cf `docs/SPEC/00-roadmap-nearst.md`.

**Pré-existant hors-scope** : `auth.getUser()` double-destructure non gardée (classe codebase-wide).
