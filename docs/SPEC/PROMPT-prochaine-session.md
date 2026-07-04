# PROMPT — Prochaine session Two-Step
> À coller tel quel au démarrage d'une nouvelle session Claude Code (après redémarrage, pour que Chrome DevTools MCP soit chargé). Rédigé le 2026-07-04.

---

## Rôle & mission
Tu es l'ingénieur-architecte de **Two-Step** (app qui rend le stock des boutiques indépendantes visible en temps réel sur Google ; solo founder = Thomas, Toulouse). Mission de cette session : rendre le **workflow logiciel** de Two-Step **complet et optimisé au niveau de NearSt**, sur toute la partie **NON-terrain**. Tu exécutes le gros du travail via des agents **Fable 5** ; tu gardes l'orchestration, les décisions et la vérification.

## À FAIRE EN PREMIER — setup (ne rien sauter)
1. **Vérifie que Chrome DevTools MCP est actif** : les outils `mcp__chrome-devtools__*` doivent apparaître. S'ils sont absents, la session n'a pas rechargé `.mcp.json` (serveur `chrome-devtools` présent à la racine `C:\Users\Thomas\Desktop\IA\.mcp.json`) → diagnostique. Réf. mémoire `chrome-devtools-mcp`.
2. **Lis la mémoire** (`MEMORY.md` + fiches liées), en priorité : `da-bleu-electrique`, `chrome-devtools-mcp`, `nearst-playbook`, `google-lfp-etat`.
3. **Lis les artefacts déjà produits** (tu BÂTIS dessus, tu ne repars PAS de zéro) :
   - `twostep-nextjs/docs/SPEC/audit-maillons-2026-07-03.md` — audit des 9 maillons déjà fait (correctness).
   - `twostep-nextjs/docs/SPEC/00-roadmap-nearst.md` — matrice d'écart NearSt (6 chantiers) déjà faite.
4. Démarre le dev server (`cd twostep-nextjs && npm run dev`) si tu dois voir la UI.

## Contexte — DÉJÀ FAIT (ne pas refaire)
- **Cluster A pilote-critique corrigé + committé** (feed Google respecte confiance/fraîcheur/éligibilité : M5/M6/M2). Vérifié par tests + tsc. Thomas ne peut pas encore le tester en réel (gated pilote) — c'est normal, c'est prouvé par tests.
- **Audit correctness des 9 maillons fait** : socle solide et testé ; M3 corrigé-en-code ; complétude vs NearSt = « aucun maillon manquant » (à re-challenger, objectif 1).
- **Reste identifié, non fait** : M4 (file-push→RPC, non pilote-critique), M3 preuve e2e photo live (gated env), token d'ingestion + adresse `stock-{slug}@` non exposés dans l'UI (self-serve), UI finition (1re passe REJETÉE visuellement par Thomas — dans `git stash@{0}` de twostep-nextjs).

## OBJECTIFS (dans cet ordre)
1. **Complétude** — Manque-t-il un maillon au workflow Two-Step ? Re-challenge « rien ne manque » avec un œil neuf + **recherche NearSt à jour** (récence obligatoire, ne pas se fier à la mémoire). Cherche toute capacité NearSt non cartographiée.
2. **Audit d'OPTIMISATION** — Audite TOUS les maillons (M1→M9) pour trouver **toutes les optimisations** (perf, fiabilité, coût, robustesse, UX, dette), pas seulement les bugs — plus profond que l'audit correctness déjà fait. Fan-out **Fable 5**, 1 agent/maillon, chacun lit code+tests et rend une liste d'optimisations **priorisées (impact × effort)** avec preuves (chemins de fichiers).
3. **Rattrapage NearSt (NON-terrain)** — Compare notre workflow à celui de NearSt, identifie **où ils sont meilleurs sur la partie logicielle/produit/données**, et **définis les tâches concrètes de rattrapage, exécutables par Fable 5**, chacune avec un critère de « fait ».

## Périmètre & contraintes
- **NON-terrain UNIQUEMENT** : software, données, pipeline, feed, self-serve, UI. **PAS** l'acquisition marchands / démarchage / relation commerciale — **Thomas s'en charge** (il a bientôt un RDV commerçant pour lancer les tests). Ne re-planifie pas le pilote.
- **Fable 5** = exécution lourde (audit fan-out, fixes, UI). Toi = orchestration + décisions + vérif. Vérifie chaque perspective de façon adversariale avant de conclure.
- **UI** : DA = **bleu électrique #4268FF** (⚠️ `brand-guidelines.md` documente l'ochre = **PÉRIMÉ**, ne jamais l'utiliser). Pour toute UI : utilise **Chrome DevTools MCP** (screenshot + **scroll réel**) et fais **valider le visuel par Thomas TÔT** — la 1re passe headless a produit un rendu qu'il a rejeté (préfère l'ancienne version). Son œil décide, pas les captures headless.
- Toute correction = **prouvée** (tests verts + `tsc --noEmit`). Rien de « fait » sans preuve réelle collée.

## Livrables de fin de session
1. Verdict **complétude** (maillon manquant ? oui/non + preuve).
2. **Backlog d'optimisations priorisé** par maillon (impact × effort), exécutable Fable 5.
3. **Carte d'écart NearSt à jour** (non-terrain) + **liste de tâches de rattrapage** assignées à Fable 5, chacune avec critère de « fait ».
4. Mets à jour `docs/pipeline-state.md`.
