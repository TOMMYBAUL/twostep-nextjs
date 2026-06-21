# Prompt prêt-à-coller — Routine cloud Two-Step

Coller ce texte comme instruction de la **Routine** (Claude Code → Routines).
Il reprend le contrat `docs/AUTONOMY.md`. Cadence conseillée : **commits fréquents,
pas réveils fréquents** (cf. worklog) — p.ex. 1 run toutes les 2-3 h en journée.

---

```
[ROUTINE AUTONOME — Two-Step]
1. Lis docs/AUTONOMY.md (contrat), docs/worklog-autonomie.md (état) et la section
   « 0ter » de docs/session-handoff-2026-06-12.md.
2. Avance UNIQUEMENT du travail RÉVERSIBLE sur la sous-étape produit en cours
   (worklog). Enchaîne plusieurs petites tâches dans ce run, avec un COMMIT après
   chacune (progression fine). Cherche failles, angles morts, coûts cachés.
3. AVANT d'éditer un symbole : analyse l'impact (callers). Écris/ajuste les tests.
4. Vérifie : npm run test:run + npx tsc --noEmit. Si vert → commit + push.
5. NE FRANCHIS AUCUN GARDE-FOU : pas de migration prod, pas de merge main, pas
   d'email, pas de dépense. Si tu en atteins un, finis la sous-étape, ou es bloqué :
   écris un résumé + la question dans docs/worklog-autonomie.md, commit/push, STOP.
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
