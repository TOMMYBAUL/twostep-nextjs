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

### L'objectif software — barre relevée par Thomas (2026-06-20)
Le prérequis n'est PAS « une V1 démontrable » (trop bas). C'est une **gestion de data exacte,
niveau géant du marché** — parce que Google teste la qualité du feed avant d'accorder le
statut LFP, et qu'un marchand qui voit son stock affiché faux s'en va. **L'exactitude EST la
promesse.** Spec fonctionnelle (Thomas dit qu'on l'a déjà sur le papier — il faut la rendre
IRRÉPROCHABLE et PROUVÉE) :
1. **Capter le stock de N'IMPORTE QUELLE source — caisse ET sans-caisse — en n'OUBLIANT RIEN.**
   Aucune perte silencieuse : pagination complète, erreurs qui lèvent (jamais `[]` masqué),
   retries, parsing sans perte (prix/qté/taille), réconciliation qui met bien à 0 le disparu.
2. **Afficher le stock de n'importe quelle boutique inscrite en QUASI TEMPS RÉEL, honnêtement**
   (webhooks + resync, fraîcheur `source_ts` vraie, états de confiance honnêtes).

**« N'oublier rien » doit devenir des INVARIANTS TESTÉS, pas une intention** : un produit
perdu doit être **impossible sans alerte**. C'est le travail n°1 — le rendre *vérifiable*.

**Deadline (Thomas, 2026-06-20)** : ~2 semaines → cible **2026-07-04** pour l'état
software-ready (data prouvée + déployable + démo de bout en bout). NB honnête : « prouvé en
conditions réelles » exige des données de vrais marchands (ta moitié) — je prouve sur données
synthétiques + invariants, tu valides en réel.

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

## 1bis. ⭐ MISSION COURANTE (2026-06-22) — VALIDER LE WORKFLOW MAILLON PAR MAILLON

> **Contexte qui a changé** : le merge `feat → main` + **déploiement prod sont FAITS**
> (`twostep.fr` est LIVE, deploy `dpl_6576onJw…` READY). La boucle n'a donc PLUS pour but
> « durcir + préparer le merge » : ce levier est tiré. **Nouveau but, fixé par Thomas
> (2026-06-22)** : prouver que **TOUT le workflow fonctionne, de bout en bout, à une QUALITÉ
> SUPÉRIEURE** — pas « les tests passent + homepage 200 » (ça, c'était avancer *grossièrement*).

### LA MÉTHODE (obligatoire, surtout en autonomie — cf. mémoire methode-qualite-incrementale)
1. **Découper en PLEIN de petites étapes** ; chaque maillon du workflow = une étape.
2. **Valider chaque maillon par une PREUVE RÉELLE** avant le suivant — pas juste un test
   unitaire vert : le maillon exécuté sur une **vraie entrée sale**, sortie **inspectée champ
   par champ** ; pour l'UI, **vue au navigateur (Playwright)** ; pour la DB, **donnée vérifiée**.
3. **Ne passer au maillon suivant QUE quand le précédent est SÛR.** Profondeur > vitesse.
4. **S'attarder sur chaque détail.** Zéro « ça compile donc c'est bon ».
5. **Le worklog montre la PREUVE de chaque étape** (sortie inspectée, capture, requête), pas « fait ».
6. Rythme : **~1 maillon (ou sous-étape) par run, en profondeur.** Prendre le temps qu'il faut.

### LE PLAN (ordre imposé par Thomas : A puis B puis C)
**A — Chaîne data, maillon par maillon (cœur de la promesse d'exactitude) :**
1. ✅ **Parse** (`parseStockFile`) — **COMPLET**. (a) commit `2623015` : fixture FR sale CSV
   UTF-8, 11 assertions champ par champ. (b) **2026-06-22** : 3 facettes restantes prouvées +
   **bug réel corrigé** — encodage **Windows-1252/Latin-1** (POS legacy FR Clictill/Fastmag/
   Excel-FR) était décodé en UTF-8 → « Quantité » mojibake → colonne qté **perdue en silence**
   (qty→1) ; fix `decodeCsvBuffer` (détection UTF-8-strict/UTF-16-BOM/CP1252) ; + chemin **XLSX
   binaire** (cellules numériques natives) + **en-têtes inhabituels** (Gencode/Libellé/Qté/PU HT/
   Pointure/Fabricant) prouvés. +10 tests. Revue silent-failure-hunter : SOUND.
2. ✅ **Triage / identité** (`ingestStockSnapshot` triage) — **COMPLET (2026-06-22)**. Preuve réelle
   `tests/ingest-maillon2-triage.test.ts` : export FR sale (parse → triage) inspecté champ par champ —
   4 GTIN (EAN-13 + **UPC-12→EAN-13 préfixe 0** + GTIN-en-colonne-Référence + **EAN-8**), 3 SKU
   (EAN checksum FAUX → fallback SKU + référence interne + PLU court), 2 rejets **listés + motivés**
   (`no_identifier`/`invalid_identifier`) ; invariant `accepté + rejeté = total` vérifié. **Alerte de
   couverture de colonnes POSÉE** : `parseStockFile` renvoie `coverage{quantity,identifier,price}` ;
   `ingestStockSnapshot` SIGNALE une colonne quantité non reconnue (sinon qty=1 muet partout) → message
   d'erreur (statut honnête « partial » + wizard) + Sentry hors simulation. **Bug réel adjacent corrigé**
   (revue silent-failure-hunter HIGH) : le stock upsert du produit CRÉÉ avalait son erreur (≠ branche
   UPDATE) → produit sans ligne stock lu « 0 » = perte silencieuse ; rendu visible + `stock_replaced`
   non compté si l'écriture échoue ; tailles/feed_events de création idem (captureError). +16 tests.
3. ✅ **Ingest / match** (items → `products`) — **COMPLET (2026-06-22)**. Preuve réelle
   `tests/ingest-maillon3-match.test.ts` (+10) : faux client Supabase **stateful** (applique
   vraiment insert/update/upsert) → chaîne CSV FR sale **parse → ingest AVEC ÉCRITURES**, table
   `products`/`stock` inspectée champ par champ. 6 scénarios prouvant l'invariant « 0 doublon » :
   (a) 1er push catalogue vide → 3 créés (nom-seul rejeté = 0 ligne), EAN/SKU/prix/qté réels
   (UPC-12 `036000291452`→`0036000291452` au CREATE, qté 6/24/7 ≠ défaut 1), `visible:false`/
   `pending` ; (b) **re-push du même fichier → 0 créé / 3 update / table inchangée** (idempotence) ;
   (c) cross-canal EAN (produit POS EAN-13 ↔ fichier UPC-12 → UPDATE) ; (d) SKU casse-insensible
   (`ts-0042` ↔ `TS-0042`) ; (e) match par NOM quand l'identité a changé ; (f) intra-push même EAN
   sur 2 libellés → 1 seul produit. Diff **test-only** (0 code prod) → pas de surface silent-failure.
4. ✅ **Réconciliation** — **COMPLET (2026-06-22)**. Preuve réelle `tests/ingest-maillon4-reconcile.test.ts`
   (+8, faux client Supabase stateful) : CSV FR sale → ingest AVEC ÉCRITURES, `stock`/`products`/
   `feed_events` inspectés champ par champ. (a) **décrémentation honnête** : un article en stock ABSENT
   du push passe à `quantity:0`, `source:"file_push"` (le push décide l'épuisement, pas la source
   périmée), `source_ts` rafraîchi, `feed_events out_of_stock` émis ; le PRÉSENT garde sa qté (REPLACE),
   jamais touché. (b) **GARDE-FOU zéro écrasement silencieux** : fichier tronqué (<50 % d'un catalogue
   ≥10) → réconciliation ANNULÉE, **12/12 stocks préservés**, erreur visible ; idem push 0-ligne-
   exploitable (illisible) → annulé, stock préservé. (c) **rupture déclarée** (qty 0 au fichier) passe
   par l'UPDATE (touched), pas par la réconciliation → pas de double comptage. **Bug réel adjacent
   corrigé** (faux positif d'affichage) : un produit sized décrémenté à 0 gardait son `available_sizes`
   JSON avec des qtés positives → la fiche produit (`product-detail.tsx`) + la facette de tailles
   globale (`/api/products/available-sizes`, gate visible-only, lit `available_sizes.quantity` PAS le
   total stock) affichaient des **pointures fantômes « disponibles »** ; fix : vidage `available_sizes:[]`
   batché dans le write de réconciliation (non bloquant, captureError). Revue silent-failure-hunter : SOUND.
5. ✅ **Confiance / fraîcheur** — **COMPLET (2026-06-22)**. Preuve réelle
   `tests/ingest-maillon5-confidence-freshness.test.ts` (+9) : le CHEMIN RÉEL (3 routes `products/[id]`,
   `by-ean`, `by-merchants` → `productConfidence`) câblé sur `source_ts`. **Bug réel corrigé (faux positif
   de fraîcheur, motif « garde cosmétique »)** : les 3 routes passaient `stock.updated_at` (heure d'ÉCRITURE
   DB) au lieu de `stock.source_ts` (heure RÉELLE de l'observation, migration 104, rempli par les webhooks
   avec l'heure de l'événement) → un webhook traité avec retard affichait « vu à l'instant / Disponible »
   pour une vente observée des heures plus tôt. Fix : helper unique `stockRowToConfidenceInput` (source
   unique anti-régression) + `source_ts` aux 3 SELECT. Revue silent-failure-hunter : 1 MED (lignes pré-104
   `source_ts=DEFAULT now()` surévalue) **adressé sans migration** via `freshnessTs()` qui PLAFONNE source_ts
   à updated_at (artefact = on prend le plus ancien). 587 tests verts. → **Chaîne data A : maillons 1→5 ✅.**
6. (puis 6 Affichage, 7 Feed Google, 8 email-in de bout en bout — voir B + suite.)

**B — UI réelle (Playwright sur l'app live)** : parcours accueil → onboarding → upload stock →
dashboard → vitrine + badge confiance. Screenshots. Lister sans complaisance ce qui est
« grossier »/amateur vs pro. (= maillon 6 Affichage prouvé pour de vrai.)

**C — (déjà amorcé)** : cette section EST l'encodage de la méthode dans le cerveau de la boucle.
Maintenir à jour ; ne pas régresser vers le « grossier ».

> Tant que A n'est pas prouvé maillon par maillon, NE PAS partir sur du nouveau feature.
> Chaque run : reprendre le 1er maillon `⬜` non prouvé, le finir avec preuve, cocher, worklog.

---

## 2. Règle de verifiability (ce que la boucle décide seule vs escalade)

L'auto-amélioration n'est fiable que sur le **vérifiable**. Donc :

- ✅ **Décide seule** ce dont le résultat est objectivement vérifiable : passe-t-il les
  tests / tsc / e2e ? le diff est-il réversible (`git revert`) ? Si oui → fais-le.
- 🔔 **Escalade (WhatsApp/Telegram, cf. §4)** tout ce qui n'est PAS vérifiable par la boucle
  seule : choix de design produit, migration prod, merge/déploiement, dépense, email externe,
  ou toute décision dont « bon/mauvais » dépend d'une intention business que je devrais
  *deviner*. **On n'invente pas une décision non vérifiable — on pose la question précise.**
  Pour un item gated, la boucle **prépare 100 % du software** (code derrière flag, **migration
  idempotente en fichier NON appliquée**, tests verts) avant d'escalader le seul GO.

> **Répartition (cf. AUTONOMY.md §1, 2026-06-20)** : Thomas = Google LFP, marchands,
> commercial, terrain. Claude = **TOUT le software** (pipeline, UI/chantier B, observabilité,
> tests, prépa déploiement, prépa migrations). La ligne irréversible (merge/migration
> appliquée/déploiement/email/dépense) = Claude prépare, Thomas donne le GO.

---

## 3. Backlog priorisé

Légende : `[R]` réversible-maintenant (nourriture de la boucle, je le fais) ·
`[G]` gated (je l'amène au point de décision puis j'escalade) ·
`[X]` externe (hors de mon périmètre, suivi seulement).

### Rang 0 — Rendre le produit DÉPLOYABLE & DÉMONTRABLE (débloque le démarchage de Thomas)
Rien n'est en prod : ~30+ commits mûrs gelés sur la branche, prod APP = ancien code. Pour
que Thomas puisse démarcher/démontrer, il faut un produit déployé et démo-able. C'est le
software qui débloque sa moitié à lui.
- ✅ **FAIT (2026-06-20 run 2)** — **Rapport de merge-readiness** (`docs/merge-readiness.md`,
  à maj à chaque run où l'état change) : checklist binaire merge→deploy. Vérifié live (Supabase
  MCP) : prod appliquée **jusqu'à 105**, **106 gated non appliquée** → merge **sans migration** ;
  branche **84 commits d'avance** ; seul bloquant software = `INSEE_API_TOKEN` (fail-open SIRET) +
  validation visuelle UI + GO humain. **À rafraîchir** quand migrations/env/e2e bougent.
- `[R]` **e2e de bout en bout** (onboarding marchand → import stock → affichage confiance →
  push canal) exécutable sur la preview, pour prouver que la démo tient. Combler les trous.
- `[R]` **Finir/combler le chantier B UI** (wizard import, badge confiance, signaler,
  scan-session, vue alertes qualité) — la logique/API est prête ; Thomas valide le rendu.
- `[G]` **Plan de déploiement** prêt (ordre merge→deploy→vérif), escalade le GO du merge.

### Rang 1 — Cœur produit : canal Google LFP (LE produit)
- ✅ **FAIT (2026-06-20, commits `87ad085`+`cd74f3f`)** — **Observabilité `productStatuses`** :
  reader paginé + `summarizeProductStatuses` pur (`src/lib/google/product-status.ts`) +
  cron `google-status` qui relit `accounts/{account}/products` après le feed et **surface
  les rejets via Sentry** (en prod, réversible, 0 migration). 18 tests. La **persistance
  marchand** (`quality_alerts` type `google_disapproved`) est **PRÉPARÉE+ESCALADÉE** :
  migration 106 idempotente NON appliquée + code derrière flag `GOOGLE_DISAPPROVAL_ALERTS=1`
  → **en attente GO Thomas** (`logs/notify-extra.txt`, option A appliquer 106+flag vs B Sentry-only).
- ✅ **FAIT (2026-06-20 run 2, commit `21e9004`)** — **Unifier `store_code`** : Voie A
  (`twostep-{id8}`, Content API) et Voie B (`slug`, XML) divergeaient → **deux magasins
  fantômes** côté Google. Source unique : `src/lib/google/store-code.ts` (`defaultStoreCode`
  + `resolveStoreCode`, persisté prime, jamais le slug) ; `buildLfpXml` prend un `storeCode`
  explicite ; route feed XML lit la connexion. +14 tests, 0 migration, réversible.
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
- `[G]` **ESCALADÉ 2026-06-21** — **Idempotence webhook delta = at-most-once** (`webhook_events`
  inséré AVANT le traitement, Shopify/Lightspeed) : un échec de traitement + retry-dedup perd
  une VENTE. **Rendu VISIBLE** (Sentry, commit `8e5872f`) → plus silencieux. Choix de fond A
  (garder, perte rare tracée) vs B (at-least-once exactly-once = design + possible migration).
  **Exposition NULLE (0 marchand)** → urgence faible. En attente Thomas (`notify-extra`).

### Rang 3 — Réversible « nourriture » (à faire quand Rang 1-2 escaladé)
- `[R]` **SIRET non-diffusible** : `verify-siret` échoue en silence → message onboarding dédié.
- `[R]` **Couverture de test des chemins critiques non testés** (sourcer les modules sans test
  sur les hot paths : feed Google, inventory, reconciliation). Vérifiable, fait monter la
  métrique-garde-fou. **Partiel (2026-06-20 run 3)** : `ingestStockSnapshot` + `resyncMerchant/
  AllStock` couverts + 2 silent-failures de complétude corrigés (lectures DB qui masquaient
  l'erreur → doublon catalogue / faux « en stock » / faux `ok` de resync). **Partiel (run 4)** :
  `google/inventory` (push LFP temps réel) couvert — 2 helpers purs extraits+testés
  (`resolveStockQuantity` défaut conservateur 0 ; `buildLocalInventoryPayload` invariant
  « in stock » avec espace) + read produits non silencieux. **Partiel (run 5)** : writes
  `sync-engine` couverts (`groupVariantsByEAN` GATE visibilité + `recalculateGroupSizes`) →
  a révélé+corrigé un **bug de prod réel** (recalc zéroait le stock d'un produit solo sans
  taille = faux « rupture » silencieux, commit `8660497`). **Partiel (run 2026-06-21)** : les
  **derniers writes silencieux de `sync-engine` sont clos** (commit `6c21c5d`) — `groupVariantsByEAN`
  (gate visibilité : lecture + 5 writes LÈVENT, sinon doublon fantôme/produit non publié),
  marquage `pending_review` (LÈVE, sinon produit non validé publié = faux positif), `updateProduct`
  + `upsertPromo` (compteurs honnêtes via captureError). +9 tests. **Partiel (run 2026-06-21
  après-midi, commit `8e5872f`)** : **hot path WEBHOOKS POS durci** — `resolveWebhookProduct`
  LÈVE sur erreur DB (≠ produit non suivi, sinon MAJ stock temps réel perdue + 200 OK silencieux) ;
  idempotence `webhook_events` check+insert non avalés (sinon double-décrément delta) ; inserts
  `feed_events` + lookup Google merchant des 4 routes en `captureError`. +4 tests, 2 revues SOUND.
  **Partiel (run 2026-06-21 soir)** : **contrat d'orchestration `syncMerchantPOS` verrouillé**
  (`tests/pos-sync-engine-orchestrator.test.ts`, +5 tests, 0 prod-code) — invariant north-star
  « jamais un `success` silencieux quand un fetch/write échoue ; un hoquet POS transitoire
  n'efface JAMAIS le catalogue ; lock occupé → all-zeros sans effet de bord ». Revue
  typescript-reviewer : SOUND (tests non vacants, mocks fidèles aux vraies chaînes). Plus de
  hot path du sync POS non testé.
- ✅ **FAIT (run 5, commit `12e08cc`)** — `pushInventoryToGoogle().catch()` (MEDIUM, divergence
  Google MC) + `notifyProductFavorites().catch()` (LOW) des 4 webhooks remontent désormais via
  `captureError` (contexte route/phase/merchantId). Observabilité seule, 0 flux. (Finding revue.)
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

---

## 7. Cadence & budget tokens (auto-régulation — Thomas : « comprends tes capacités »)

Le wrapper écrit le coût de CHAQUE run dans `logs/cost-ledger.txt` (`cost_usd`, `turns`).
**Au début d'un run, lis le ledger** : c'est ta connaissance de toi-même.

> ⚠️ **`cost_usd` est NOTIONNEL, pas une facture.** Thomas est sur un abonnement Claude
> (`billingType: apple_subscription`, `hasExtraUsageEnabled: false`) → **aucune facturation au
> token possible**. Le vrai plafond = le **quota d'usage de l'abonnement** (fenêtre glissante
> ~5 h + cap hebdomadaire), PARTAGÉ avec l'usage perso de Thomas. Mode d'échec = rate-limit
> (run qui échoue + Thomas bloqué de son propre Claude), JAMAIS un coût. Le `cost_usd` sert de
> **jauge relative** de quota mangé. **Si un run échoue sur rate-limit** (exit non-0 / « usage
> limit » dans le log) : ne pas réessayer en boucle, le noter, lever le pied — le quota se
> rétablit au reset.

- Objectif : avancer vite sur la deadline (2 semaines) SANS cramer l'abonnement. Un seul run
  tourne à la fois (tâche en `IgnoreNew`, ExecutionTimeLimit 90 min) → coût borné par le
  temps réel, pas d'emballement parallèle.
- **Si le coût cumulé dérive** (ex. tu te projettes à épuiser le budget avant la deadline) :
  écris-le dans le worklog + escalade une recommandation de réduire la fréquence. Ne fais pas
  l'autruche : mieux vaut 8 runs profonds/jour soutenables que 40 qui claquent le quota mardi.
- **Préfère peu de runs PROFONDS** (une vraie unité finie : feature + tests + commit) à
  beaucoup de runs courts qui se tuent à mi-chemin. La cadence n'est pas la métrique ; la
  data exacte prouvée l'est.

> Item de travail n°1 dérivé de l'objectif §1 : **construire les INVARIANTS DE COMPLÉTUDE
> testés** (« aucune source ne perd un produit/qté/prix sans alerte ») — les transformer de
> garde-fous épars en propriété vérifiée de bout en bout. À traiter en Rang 1-2.

---

## 8. Pilotage de la boucle (loop-operator + harness-optimizer + context engineering)

Intégré d'ECC (2026-06-20). Agents dispo dans `.claude/agents/`. Voir aussi AUTONOMY.md §11.

### 8.1 Conditions d'arrêt / escalade (taxonomie loop-operator)
Escalade (WhatsApp, §4) ET arrête l'item courant dès que :
- aucun progrès sur 2 checkpoints consécutifs (pas de commit/test qui avance) ;
- échecs répétés avec la **MÊME erreur** (même message/stack) — ne pas marteler ;
- dérive de coût hors budget (cf. §7) ;
- conflit de merge bloquant.
Avant de lancer un item : gate vert actif + chemin de rollback (branche) + isolation OK.

### 8.2 Auto-surveillance EN run (d'après le hook ecc-context-monitor)
Réagis sans attendre la fin :
- **coût** : un run qui dépasse ~8-10 $ notionnels = probablement du contexte gaspillé → resserre.
- **scope-creep** : >20 fichiers touchés dans un « petit pas » = tu as débordé → recadre/découpe.
- **boucle d'outils** : 3× le même appel sans progrès → stop, change d'approche.

### 8.3 Revues spécialistes OBLIGATOIRES (cf. AUTONOMY §11.3)
Avant de committer : diff pipeline → `silent-failure-hunter` ; migration/concurrence →
`database-reviewer` ; secrets/auth/Stripe → `security-reviewer`. **C'est ce qui rend le travail
autonome DIGNE DE CONFIANCE, pas juste rapide.**

### 8.4 Context engineering = LE levier coût (méthode harness-optimizer)
- **Codemaps** : lire `docs/CODEMAPS/*` (token-lean) AVANT de re-scanner le repo ; régénérer si
  absent/périmé (>30 % de diff). Évite de recharger Next/Supabase à chaque run.
- **MCP** : n'activer que le strict nécessaire (Supabase + git CLI). Chaque tool MCP ≈ 500 tokens
  de schéma → désactiver les inutiles = 1er levier coût (audit `context-budget`).
- **Compaction** aux frontières logiques (jamais en pleine implémentation) ; « écrire avant de
  compacter » ; seuils adaptés au modèle 1M.
- Réduction de coût = méthode `harness-optimizer` : baseline (ledger) → top 3 leviers →
  changement minimal réversible → mesure du delta.
