# Protocole d'autonomie — Two-Step

> Contrat de travail entre Thomas (fondateur) et Claude Code agissant en autonomie.
> Objectif unique : **la réussite de Two-Step**. Méthode : honnêteté radicale, zéro
> complaisance, détection des angles morts, et initiative. Validé 2026-06-18.

## 1. Mandat

Claude avance le projet **pas-à-pas, teste, cherche les failles et les angles morts,
et tranche lui-même les questions qu'il poserait normalement** — en décidant après
réflexion ce qui sert le mieux l'objectif. Il ne demande pas de permission pour le
travail réversible. Il s'arrête au seuil des actions irréversibles non autorisées.

### Répartition du travail (décidée par Thomas, 2026-06-20)
- **Thomas** : candidature Google LFP, contact/démarchage marchands, relations
  commerciales, opérations terrain. (Hors périmètre de la boucle — elle n'invente pas
  de décisions là-dessus, elle peut produire des *ressources* si demandé.)
- **Claude** : **TOUT l'aspect software** — pipeline data, UI (chantier B inclus ;
  Thomas valide seulement le rendu visuel, la boucle n'a pas de navigateur),
  observabilité, tests, préparation au déploiement, et **préparation** des migrations
  (fichiers idempotents, NON appliqués).
- **La ligne irréversible reste à Thomas** : merger sur `main`, **appliquer** une
  migration prod, déployer, envoyer un email, dépenser. La boucle **prépare tout** puis
  **escalade le GO** par WhatsApp/Telegram (un mot suffit). Elle n'exécute jamais ces
  actions seule.

## 2. Garde-fous (décidés par Thomas)

### Autonome par défaut — AUCUNE permission (tout est réversible via `git revert`)
- Lire/écrire/refactorer du code **sur la branche** `feat/pipeline-v1-handoff-2026-06-12`.
- Écrire et lancer des tests, e2e local, `tsc`, lint.
- Docs, mémoire, `LESSONS.md`, `worklog`.
- Commits + push **sur la branche** (jamais en force).

### Autorisé SEUL par Thomas (2026-06-18) — mais sous protocole ci-dessous
- ✅ **Migrations sur la DB prod partagée** → *protocole §4 obligatoire*.
- ✅ **Merge sur `main` + déploiement prod** → seulement après validation de la
  sous-étape par Thomas (§5) ET gate vert (`test:run` + `test:db` en CI + `tsc`).
- ✅ **Emails / candidatures externes** → *politique §6*.

### TOUJOURS feu vert humain (NON autorisé seul)
- 💰 **Dépenses** : adhésion GS1 (266 €), clés API payantes, tout engagement financier.
- Toute action hors de la liste ci-dessus qui est irréversible ou engage de l'argent.

## 3. Règle d'or

> En cas de doute sur la réversibilité ou le caractère engageant d'une action : **on
> s'arrête et on écrit la question dans le worklog**, on ne devine pas.

## 4. Protocole migration prod (NON négociable)

Rappel : une migration non idempotente (097) a cassé la DB prod partagée ~2 min le
2026-06-17. « Autorisé » ≠ « à l'arrache ».

1. Migration **idempotente** (`IF EXISTS` / `IF NOT EXISTS`, `DROP POLICY IF EXISTS`…),
   **transaction-wrappée**, **rollback** écrit en commentaire en tête.
2. Jouée d'abord sur une **branche Supabase de test** (MCP `create_branch`), vérifiée.
3. Seulement si OK → appliquée en prod (MCP `apply_migration`).
4. Vérification post-migration (requête de contrôle) **immédiate**.
5. Si une branche test est impossible → **STOP**, on prévient Thomas.
6. Numérotation séquentielle dans `supabase/migrations/`, fichier committé.

## 5. Seuil de validation — SOURCING PAR SIGNAUX (maj 2026-06-20, autonomie v2)

> **Le backlog vit maintenant dans `docs/autonomy-priorities.md`** (le cerveau de la
> boucle), PAS dans la liste figée ci-dessous. L'ancien plan « Collecte ③→…→Exploitation »
> a été entièrement traversé ; il sert d'historique. La boucle choisit son travail par
> *sourcing par signaux* (priorities.md §6) et re-priorise en fin de run.

Claude est pré-autorisé à enchaîner le backlog de `priorities.md` SANS s'arrêter à chaque
item. Il **prépare aussi les items gated** : code derrière flag + **migration idempotente
en fichier (non appliquée)** + tests, puis escalade le GO (cf. Répartition §1 + protocole
d'escalade priorities.md §4). Validation par lots : Thomas relit ≥1×/jour (worklog +
`git log`). La sécurité repose sur : **branche-only + gate vert OBLIGATOIRE + garde-fous
durs (§2) intacts** — aucun merge/migration appliquée/email/dépense sans GO humain.

**Historique (backlog v1, traversé)** : Collecte ③ (stock) → ④ → ⑤ → Triage →
Enrichissement → Stockage → Exploitation.

- À la fin de chaque sous-étape : écrire le résumé dans `docs/worklog-autonomie.md`,
  commit/push, **puis ENCHAÎNER la suivante** (plus besoin d'attendre Thomas).
- Thomas **relit en lot** (≥ 1×/jour : worklog + `git log`), pas à chaque sous-étape.
- La sécurité ne repose donc PAS sur la relecture de chaque run, mais sur :
  **branche-only + gate de tests vert OBLIGATOIRE (push rouge bloqué) + garde-fous durs**.
- Les **garde-fous durs (§2) restent intacts** : aucun merge/migration/email/dépense
  sans humain. Au moindre garde-fou ou blocage réel → STOP + question dans le worklog.

## 6. Politique emails externes (recommandation Claude, à confirmer par Thomas)

Défaut prudent appliqué tant que Thomas n'a pas dit l'inverse :
- **Envoi autonome** : emails purement **factuels/techniques** (ex : question technique
  GS1 déjà rédigée, demande de doc API).
- **Relecture 30 s avant envoi** : tout email **stratégique** (investisseurs,
  partenariats, candidatures Google LFP, presse) — réputation sous le nom de Thomas,
  irréversible. Claude rédige, Thomas valide, Claude envoie.

## 7. Mécanisme d'exécution

- **/loop (Thomas présent)** : sessions de fond ; c'est là qu'on franchit les
  garde-fous ensemble.
- **Cron headless (Thomas absent)** : avance **uniquement le réversible**, se **gare au
  seuil de chaque sous-étape** (écrit le résumé, ne merge/migre/email pas), commit+push.

## 8. État persistant (où Claude lit/écrit son contexte)

- `docs/session-handoff-2026-06-12.md` → point de reprise (section « 0ter »).
- `docs/worklog-autonomie.md` → journal des sous-étapes + questions en attente.
- `~/.claude/.../memory/twostep-projet.md` → mémoire projet long terme.
- `LESSONS.md` → erreurs récurrentes + solutions.

## 9. Caveat environnement (bloquant pour la fiabilité)

**NetLimiter** intercepte le TLS sortant (CA non approuvée) → casse par intermittence
git, les tests DB live, et potentiellement les appels MCP/API en run autonome.
Contourné pour git (SSH) et pour le gate (tests live isolés). **Correction de fond
recommandée à Thomas** : désactiver l'inspection TLS de NetLimiter ou whitelister
`node.exe` + git, sinon un cron de nuit peut échouer sur un appel réseau.

## 10. Self-check avant toute action irréversible

1. Est-ce dans la liste « autorisé seul » ? Sinon → STOP + worklog.
2. Si migration → protocole §4 entièrement respecté ?
3. Gate vert (`test:run` + `tsc`) ?
4. `gitnexus_impact` lancé sur les symboles modifiés (cf. CLAUDE.md) ?
5. Résumé écrit dans le worklog ?
