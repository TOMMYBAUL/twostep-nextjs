# Boucle de recherche autonome — 2026-04-22

Préparation de l'infrastructure pour la Mission 4 (boucle 4-8 cycles auto-alimentée) décrite dans `twostep-brain/06-Tech/Outillage-roadmap-2026-04-23.md`.

## État

- ✅ Structure dossier créée
- ✅ `JOURNAL.md` initialisé
- ⏳ **Bloqué par** : graphify du Nexus Obsidian (prérequis pour que la boucle auto-génère des questions depuis le Nexus)
- ⏳ Lancement de la boucle : Thomas décide — durée 3-8h, consomme plusieurs $ de tokens API

## Quand lancer la boucle

1. graphify Nexus terminé (fichier `graphify-out/graph.json` existe dans `twostep-brain/TwoStep-Brain/`)
2. Thomas dispose d'une journée libre (4-8h) — lancer le matin, lire le soir
3. Utiliser le prompt standard du protocole (§ "Mécanisme anti auto-validation" de la roadmap) pour éviter l'auto-validation prématurée

## Livrables attendus à la fin de la boucle

- `cycle-01/` à `cycle-NN/` (NN = 4-8)
  - Chaque cycle : `00-INGESTION.md`, `01-QUESTIONS.md`, `02-Q*-<slug>.md`, `03-AUTOCRITIQUE.md`, `04-SYNTHESE.md`, `05-NEXT-CYCLE-SEEDS.md`, `06-CONTINUATION.md`
- `MASTER-SYNTHESIS.md` — 10 insights les + importants
- `ACTION-PLAN.md` — 5-8 actions prioritaires Thomas
- `META-REPORT.md` — auto-évaluation qualité

## Critères d'arrêt (point fixe)

Si les 3 vrais → STOP :
- 3 derniers cycles < 2 insights de confiance ≥ 7
- Questions générées = variantes de questions déjà traitées
- Synthèse globale n'a plus d'angles morts majeurs

## Quotas par cycle (non-négociables)

| Étape | Quota minimum |
|---|---|
| Ingestion | 15 graphify Nexus + 10 graphify codebase + 8 claude-mem |
| Questions | 20 brutes, 5 sélectionnées via pondération impact/nouveauté/testabilité/angle mort |
| Recherche par Q | 12 web_search + 8 web_fetch + 3 graphify + 3 contradictoires + 5 angles + ≥2000 mots + ≥15 URLs |
| Auto-critique | 3 faiblesses × 3 web_search |
| Synthèse | Top 3 insights |
| Seeds | ≥15 questions pour cycle N+1 |
