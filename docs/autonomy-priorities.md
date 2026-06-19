# Autonomie — North-star & backlog priorisé (le cerveau de la boucle)

> **La boucle lit CE fichier EN PREMIER, à chaque run.** Il dit *quoi faire ensuite*,
> *pourquoi*, et *où s'arrêter pour escalader*. Il est re-priorisé à la fin de chaque run
> (cf. §5). Pair avec : `AUTONOMY.md` (garde-fous), `worklog-autonomie.md` (journal),
> `LESSONS.md` (mémoire d'erreurs), `session-handoff-2026-06-12.md` (état détaillé).
>
> Maj initiale : 2026-06-20 (refonte autonomie v2 — sourcing par signaux + métrique + escalade).

---

## 1. North-star (ne change pas sans Thomas)

**Two-Step = « feed Google LFP as a service » d'abord** (valeur indépendante de l'audience),
app de découverte ensuite. **Le cœur = la qualité de la data stock** : propre, traçable,
enrichissable, affichée honnêtement (zéro faux positif). C'est ce que NearSt a réussi et ce
qui a tué MVMS/Milo (catalogue fantôme).

### La métrique unique de la boucle
> **% du backlog produit à forte valeur qui est CONSTRUIT + TESTÉ + mis en scène jusqu'au
> point d'UNE décision de Thomas.** Objectif : 100 %. Quand on l'atteint, le goulot n'est
> plus moi — il est sur Thomas (merge/migration) ou externe (Google/marchands).

**Métrique-garde-fou (ne jamais dégrader)** : `npm run test:run` vert + `tsc` OK à chaque
commit ; couverture de test des chemins critiques qui MONTE, jamais qui baisse.

### Ce que la boucle ne peut PAS faire (vérité, pas défaitisme)
Les 2 vrais goulots du projet sont **externes et appartiennent à Thomas** :
1. **Candidature Google LFP en limbo depuis avril** (tickets 5-9519000040422 /
   6-7242000040976, MC 5755722759). Aucune ligne de code ne débloque ça.
2. **Zéro marchand.** Le hardening sert des marchands qui n'existent pas encore.

Donc la boucle rend le produit **prêt**, jamais **adopté**. « Terminer le projet » =
prêt-à-merger + Google répond + 1er marchand. Seul le premier tiers est dans mon périmètre.

---

## 2. Règle de verifiability (ce que la boucle décide seule vs escalade)

L'auto-amélioration n'est fiable que sur le **vérifiable**. Donc :

- ✅ **Décide seule** ce dont le résultat est objectivement vérifiable : passe-t-il les
  tests / tsc / e2e ? le diff est-il réversible (`git revert`) ? Si oui → fais-le.
- 🔔 **Escalade (WhatsApp/Telegram, cf. §4)** tout ce qui n'est PAS vérifiable par la boucle
  seule : choix de design produit, migration prod, merge/déploiement, dépense, email externe,
  ou toute décision dont « bon/mauvais » dépend d'une intention business que je devrais
  *deviner*. **On n'invente pas une décision non vérifiable — on pose la question précise.**

---

## 3. Backlog priorisé

Légende : `[R]` réversible-maintenant (nourriture de la boucle, je le fais) ·
`[G]` gated (je l'amène au point de décision puis j'escalade) ·
`[X]` externe (hors de mon périmètre, suivi seulement).

### Rang 1 — Cœur produit : canal Google LFP (LE produit)
- `[R]` **Observabilité `productStatuses`** : lire l'acceptation/rejet Google par produit
  (`src/lib/google/*`, `api/google/stats`). Aujourd'hui on POUSSE en aveugle. Construire le
  reader + surfacer les rejets (Sentry/quality_alerts) + tests. **Réversible, haute valeur.**
- `[R]` **Unifier `store_code`** : Voie A (`twostep-{id8}`, Content API) vs Voie B (`slug`,
  XML) divergent → réconcilier en une source unique + tests. Réversible.
- `[G]` **Câbler `pushInventoryToGoogle` sur le chemin file-push** (`ingestStockSnapshot`) :
  c'est le mécanisme « feed LFP pour marchands SANS caisse » = cœur du positionnement.
  Aujourd'hui un stock poussé par fichier ne propage JAMAIS à Google ; un produit réconcilié
  à 0 reste « in stock » sur Google (faux positif n°1). **Écriture externe sous le compte
  Google du marchand + le design spec ne liste pas ce trigger.** → préparer le code derrière
  un flag, tests, puis ESCALADE : *« veut-on propager le stock file-push vers Google LFP ? »*
- `[G]` **Association store_code ↔ Google Business Profile** : LFP l'exige, totalement absente
  (scope `business.manage` manquant, colonne, flux). Gros chantier → préparer migration
  idempotente + code derrière flag, ESCALADE pour le scope OAuth + la migration.

### Rang 2 — Intégrité stock multi-source (l'enjeu fiabilité)
- `[G]` **Scoping multi-tenant webhook Lightspeed** (perte de vente silencieuse). Interim sûr
  déjà posé (captureError rend la perte visible). Fix de fond = associer webhook→compte +
  scoper par merchant_id → design + migration. ESCALADE : *« comment relier un webhook
  Lightspeed à son marchand : account ID payload ? URL par-marchand à token ? »*
- `[G]` **Writes directs (sync/resync/file_push) bypassent la garde anti-régression 104**
  (seuls les webhooks passent par la RPC). Router via la RPC = changement de comportement +
  migration. ESCALADE après avoir préparé l'option.
- `[G]` **Delta `GREATEST(v_prev_ts, p_source_ts)`** côté RPC = migration prod (protocole §4).
  Préparer la migration idempotente + branche test, ESCALADE le feu vert.

### Rang 3 — Réversible « nourriture » (à faire quand Rang 1-2 escaladé)
- `[R]` **SIRET non-diffusible** : `verify-siret` échoue en silence → message onboarding dédié.
- `[R]` **Couverture de test des chemins critiques non testés** (sourcer les modules sans test
  sur les hot paths : feed Google, inventory, reconciliation). Vérifiable, fait monter la
  métrique-garde-fou.
- `[R]` **Variantes orphelines** sur correction EAN manuelle (re-groupage) — si design clair.
- `[R]` **Câblage `parseCiiXml` dans `parseInvoice`** (Factur-X, oblig. sept. 2026) — le
  parseur est durci+testé, prêt ; le câblage extraction PDF/A-3 reste. Évaluer la valeur.

### Rang 4 — Déblocages externes / Thomas (suivi, j'escalade, je ne fais pas)
- `[X]` **Merge `feat/pipeline-v1-handoff-2026-06-12` → main + déploiement** : tout est mûr
  et testé, ~30+ commits d'avance, rien en prod. **C'est le déblocage à plus fort levier** :
  sans merge, tout mon travail reste gelé. ESCALADE prioritaire.
- `[X]` **Candidature Google LFP** (limbo) : clarifier modèle A (data provider, validation
  bloquée) vs B (LFP par marchand via OAuth content qu'on a déjà) — **peut débloquer tout le
  produit sans attendre Google.** À relancer par Thomas.
- `[X]` **Clés/env prod manquantes** : ANTHROPIC, GEMINI, UPCITEMDB, INSEE (fail-open SIRET !),
  KICKSDB (FREE gratuite), GS1 (clé attendue lundi 2026-06-22), STRICT_DECRYPT, secret
  GitHub SUPABASE_DB_URL (backup).
- `[X]` **Validation visuelle UI** (badge confiance, wizard import, scan-session) : pas de
  navigateur côté boucle → Thomas valide.

---

## 4. Protocole d'escalade (WhatsApp + Telegram)

Thomas LIT WhatsApp/Telegram. Quand le prochain item à plus forte valeur est `[G]`/`[X]` :

1. Préparer tout le réversible de l'item (code derrière flag, migration idempotente non
   appliquée, tests verts, commit/push).
2. **Envoyer UNE notif avec une décision binaire/précise** (pas « j'ai une question » vague).
   Format : `[DECISION] <item> — <option A> vs <option B>. Préparé+testé, prêt à <action> sur
   ton OK. Détail: worklog.` Ex : *« [DECISION] Google file-push : propager le stock fichier
   vers Google LFP ? Code prêt derrière flag GOOGLE_FILEPUSH=1, 6 tests verts. OK pour activer
   au merge ? »*
3. **Ne PAS stagner** : marquer l'item « escaladé, en attente Thomas » dans ce fichier, puis
   PASSER à l'item réversible suivant. La boucle ne s'arrête que si TOUT est escaladé/bloqué.

---

## 5. Auto-amélioration : revue de fin de run (la boucle de Reflexion)

À la fin de CHAQUE run, avant de s'arrêter :
1. **Mesurer** : qu'est-ce qui a bougé sur la métrique (§1) ? combien d'items `[R]` fermés ?
   combien d'items `[G]` amenés au point d'escalade ?
2. **Réfléchir (Reflexion)** : qu'ai-je appris ? une erreur récurrente ? → entrée `LESSONS.md`.
   Un faux positif de l'agent Explore ? → noter le pattern pour ne pas le re-chasser.
3. **Re-prioriser** : mettre à jour le Rang/statut des items ci-dessus (fait, escaladé,
   nouveau signal). **Si un item s'avère sans valeur, le RETIRER** (zéro complaisance : on ne
   garde pas du busywork pour « avoir quelque chose à faire »).
4. **Honnêteté de rendement** : si le réversible est épuisé ET tout le haut du backlog est
   escaladé/externe → l'écrire franchement et RECOMMANDER de réduire la cadence des runs
   (la valeur est alors chez Thomas, pas dans plus de runs). Ne pas fabriquer du travail.

---

## 6. Sourcing du travail — par SIGNAUX, pas par devinette

Ordre de préférence pour trouver le prochain `[R]` (remplace « Explore devine des bugs ») :
1. **Ce fichier** (backlog priorisé) en premier.
2. **Signaux réels** : `captureError`/Sentry, échecs e2e, `quality_alerts`, statuts `partial`/
   `error` dans les crons — du vérifiable, pas du supposé.
3. **Chemins critiques non testés** (couverture qui manque sur un hot path).
4. **En dernier seulement** : exploration libre — et alors **chaque finding est vérifié dans
   le code réel** avant d'être traité (cf. LESSONS : ~70 % des findings Explore étaient faux).
