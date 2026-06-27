# Prompt prêt-à-coller — Routine cloud Two-Step

Coller ce texte comme instruction de la **Routine** (Claude Code → Routines).
Il reprend le contrat `docs/AUTONOMY.md`. Cadence conseillée : **commits fréquents,
pas réveils fréquents** (cf. worklog) — p.ex. 1 run toutes les 2-3 h en journée.

---

```
[ROUTINE AUTONOME — Two-Step]
0. Lis docs/pipeline-state.md EN PREMIER (le fil conducteur, compact : pipeline, status,
   next_action). C'est ta reprise — schéma/enum dans docs/os-architecture.md.
1. Puis docs/AUTONOMY.md (contrat). SEULEMENT si besoin de détail : docs/worklog-autonomie.md
   (journal) et la section « 0ter » de docs/session-handoff-2026-06-12.md.
2. Avance UNIQUEMENT du travail RÉVERSIBLE sur la sous-étape produit en cours
   (worklog). Enchaîne plusieurs petites tâches dans ce run, avec un COMMIT après
   chacune (progression fine). Cherche failles, angles morts, coûts cachés.
2bis. VEILLE R&D (1×/JOUR MAX — seulement si docs/veille-rd.md n'a pas d'entrée datée
   d'aujourd'hui ; sinon SAUTER). Rôle = agent R&D qui suit l'actu pour la croissance de
   Two-Step. Via le skill `last30days` (sinon WebSearch en repli), 1-2 requêtes CIBLÉES
   (ex : enrichissement produit/recherche image par EAN, Google LFP/local inventory,
   intégrations POS FR, concurrents type NearSt). Écris dans docs/veille-rd.md une entrée
   datée : 3-5 trouvailles ACTIONNABLES max, chacune {source, quoi, pourquoi pertinent
   Two-Step, action suggérée}. Filtre le bruit. Si une piste vaut un test → l'ajouter au
   backlog (autonomy-priorities §3). Crédits last30days limités (100 gratuits) : requêtes
   serrées, logge si épuisé. NE déraille PAS la sous-étape produit — la veille est courte.
3. AVANT d'éditer un symbole : analyse l'impact (callers). Écris/ajuste les tests.
4. Vérifie : npm run test:run + npx tsc --noEmit. Si vert → commit + push.
5. NE FRANCHIS AUCUN GARDE-FOU : pas de migration prod, pas de merge main, pas
   d'email, pas de dépense. Si tu en atteins un, finis la sous-étape, ou es bloqué :
   écris un résumé + la question dans docs/worklog-autonomie.md, commit/push, STOP.
6. EN DERNIER : mets à jour docs/pipeline-state.md (frontmatter : status, next_action,
   gate, last_run, last_commit, blocked_on). C'est le fil conducteur du prochain run.
Honnêteté radicale : si un test casse, dis-le dans le worklog ; ne maquille rien.
Ne démarre PAS une nouvelle sous-étape sans validation humaine — finis l'actuelle.
```

---

## Réglages de la Routine (least privilege)
- **Repo** : `twostep-nextjs` uniquement.
- **Branche de push** : par défaut Routines pousse sur une branche `claude/…` →
  tu mergeras (ou configure pour viser la branche de travail). NE PAS viser `main`.
- **Connecteurs MCP** : AUCUN nécessaire pour ce travail (code + tests + commit).
  Ne PAS inclure Supabase/Stripe/etc. — les migrations sont un garde-fou de toute façon.
- **Réseau** : minimal (npm install + git push).
- **Plafond runs/jour** : à vérifier dans claude.ai/code/routines (il fixe la cadence max).
