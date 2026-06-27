---
# FIL CONDUCTEUR de la boucle autonome — source de vérité sur « où on en est ».
# La boucle lit CE fichier EN PREMIER (compact) avant les gros docs, et le met à jour
# EN DERNIER à chaque run. Schéma + enum documentés dans docs/os-architecture.md.
pipeline: maillon-9-enrichissement
step: 9
step_total: 9
step_name: "enrichissement (photo/marque/catégorie) — CASSÉ, priorité n°1"
status: todo              # todo|in_progress|testing|pushed|blocked_human|blocked_external|done
blocked_on: "thomas:trancher env Routine (clés API live) vs run supervisé pour le e2e photo"
next_action: "(a) régression fail-open de la vérif IA Haiku sur fixtures (sans yeux) ; puis (c) marque, (d) mapping catégorie FR ; e2e photo = escaladé"
branch: feat/pipeline-v1-handoff-2026-06-12
gate: green               # green|red|unknown  (test:run + tsc au dernier commit)
last_run: 2026-06-27
last_commit: 0acc5b8
---

# État resumable — MAILLON 9 : ENRICHISSEMENT (priorité n°1, 2026-06-27)

**Reprise rapide (lire d'abord ceci, puis `autonomy-priorities.md` §1bis ⭐⭐).**

- **Nouvelle priorité absolue** : le maillon ENRICHISSEMENT (photo/marque/catégorie) est
  **cassé**, révélé par le 1er test réel du 27/06 (cf `docs/workflow-ingestion-enrichment.md`) :
  photos 6/7 fausses, vérif IA Haiku fail-open, marque null 7/7, catégorie 2/7 FR.
- **Ce que la boucle fait SEULE** (unit-testable) : (a) régression du fail-open de la vérif IA
  sur fixtures de paires (produit, image fausse) ; (c) extraction marque ; (d) mapping catégorie FR.
- **Escaladé à Thomas** : le test e2e photo sur vrais EAN exige un env live (clés API + serveur) —
  la Routine cloud est « code+tests seulement ». Thomas tranche : upgrade env Routine OU run supervisé.
- Phase E (UI) : maillons google/mon-stock/review/connexion-POS faits+poussés (tests 890). Reste =
  rendu VISUEL (Thomas + `ui-journey.mjs`) — **déprioritisé derrière le maillon 9**.

**Nouvelle étape de run** : VEILLE R&D 1×/jour (routine-prompt §2bis → `docs/veille-rd.md`).

**Pré-existant hors-scope** : `auth.getUser()` double-destructure non gardée (classe codebase-wide).
