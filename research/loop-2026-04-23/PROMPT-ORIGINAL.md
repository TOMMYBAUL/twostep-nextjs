# Prompt original de lancement — Boucle auto-alimentée Two-Step

*Fourni par Thomas le 2026-04-23 à ~00:30 (session de nuit)*
*Configuration : 5 cycles · test en conditions réelles*

## Source

Prompt écrit par Claude (session après-midi 2026-04-22) + Thomas. Reproduit ci-dessous pour traçabilité et reproductibilité.

---

# Mission : Boucle de recherche autonome auto-alimentée sur Two-Step

## Principe fondamental
Tu vas exécuter N cycles de recherche en complète autonomie. Chaque cycle génère ses propres questions à partir de l'état actuel du projet (Nexus Obsidian + codebase + résultats des cycles précédents). Chaque cycle enrichit la base de connaissance pour le suivant.

Tu ne t'arrêtes pas quand tu "penses avoir assez". Tu t'arrêtes quand tu as complété N cycles OU quand tu as atteint un point fixe (3 cycles consécutifs sans nouvelle insight significative).

**Nombre de cycles cibles : 5 (configuration test cette nuit)**

## Règles absolues (non négociables)
- Aucune modification de code applicatif
- Tout dans `research/loop-2026-04-23/`
- Chaque cycle a son propre sous-dossier : `cycle-01/`, `cycle-02/`, etc.
- Zéro intervention humaine attendue — Claude décide de tout
- Chaque affirmation = minimum 1 URL source réelle (web_fetch, pas juste search)

## STRUCTURE D'UN CYCLE

### Étape 1 — Ingestion (quotas)
- Minimum 15 `graphify query` sur le Nexus (angles variés)
- Minimum 10 `graphify query` sur le codebase twostep-nextjs
- Minimum 8 souvenirs claude-mem consultés
- Si cycle > 1 : lecture COMPLÈTE des rapports des cycles précédents
- Écrire `cycle-NN/00-INGESTION.md` (≥ 2000 mots)

### Étape 2 — Génération auto des questions
- 20 questions candidates brutes minimum
- Tirées de 4 sources : angles morts Nexus, contradictions Nexus↔code, dépendances implicites, questions précédentes non résolues
- Format chaque Q : question / source / hypothèse départ / pourquoi ça compte / déjà traitée ?
- Sélection 5 retenues via pondération : impact go-to-market 40% · non-traitée 25% · testabilité 20% · angle mort probable 15%
- Écrire `cycle-NN/01-QUESTIONS.md`

### Étape 3 — Recherche profonde (par question)
Quotas stricts pour CHAQUE question retenue :
- ≥ 12 web_search avec queries variées
- ≥ 8 web_fetch
- ≥ 3 graphify query croisées
- ≥ 3 sources qui CONTREDISENT l'hypothèse
- ≥ 5 angles d'approche
- Document final : ≥ 2000 mots, ≥ 15 URLs

Structure : hypothèse départ / recherches effectuées / findings / sources contradictoires / options ≥ 5 / application Two-Step / nouvelles questions / recommandation + confiance 1-10 / incertitudes / sources ≥ 15

### Étape 4 — Auto-critique
`cycle-NN/03-AUTOCRITIQUE.md` :
- 3 faiblesses par Q
- 3 web_search ciblées par faiblesse
- MAJ documents Q si nouvelles recherches changent la donne

### Étape 5 — Synthèse
`cycle-NN/04-SYNTHESE.md` :
- Top 3 insights
- Impact concret Two-Step
- Contradictions vs cycles précédents
- Confirmations vs cycles précédents
- Confiance globale 1-10

### Étape 6 — Seeds pour cycle suivant
`cycle-NN/05-NEXT-CYCLE-SEEDS.md` :
- ≥ 15 nouvelles questions émergées
- Chaque question liée à sa source

### Étape 7 — Décision continuer/arrêter
`cycle-NN/06-CONTINUATION.md`
Arrêt si les 3 vrais : < 2 insights confiance ≥7 sur les 3 derniers / questions = variantes déjà traitées / synthèse globale sans angles morts majeurs

## ÉTAPE FINALE (après la boucle)
- `MASTER-SYNTHESIS.md` : 10 insights top, évolution compréhension, contradictions non résolues, angles morts persistants
- `ACTION-PLAN.md` : 5-8 actions Thomas par impact, effort/impact/deps/risques, 10 questions pour Thomas
- `META-REPORT.md` : nb cycles + pourquoi arrêt, note qualité /10 par cycle, failure modes, recos

## MÉCANISME ANTI-AUTO-VALIDATION
À chaque "ce cycle est fini" :
1. Relire les quotas
2. Si un seul pas coché → ne peut pas avancer
3. Si tous cochés mais instinct dit "trop vite" → 3 recherches sup sur point faible
4. Logger dans JOURNAL toute tentation d'arrêt

## JOURNAL en temps réel
`research/loop-2026-04-23/JOURNAL.md` : début/fin cycles, transitions, décisions non-triviales, tentations, blocages

---

## Écarts assumés par Claude Opus pour cette exécution (2026-04-23)

Je vais essayer de tenir ces quotas mais je préviens honnêtement :
- Si rate limit API externe (Google, sites fetchés) je note dans JOURNAL et adapte
- Si le graphify du Nexus retourne des résultats trop maigres sur un sujet, je réduis le quota Nexus et compense par web
- Je vise 5 cycles mais je m'arrête si je détecte dérive sérieuse (cycles qui se répètent)
- Contexte Claude Opus 4.7 1M tokens — mais les 50+ documents produits vont bouffer. Je watchdog le contexte utilisé.
