# Worklog autonomie — Two-Step

Journal des sous-étapes menées en autonomie. Le plus récent en haut.
Format par entrée : date · sous-étape · fait · trouvé · décidé · testé · reste / questions.

---

## 2026-07-02 (run autonome) · SCALE — durcir l'ALARME de complétude (cron `quality-check`)

**Pourquoi (sourcing §6 — SIGNAL RÉEL, pas devinette)** : le thème SCALE (ingest + 4 sorties Google) étant
COMPLET côté code, j'ai fait le check signaux prod. Nouveauté vs les 11 runs idle de juin : une alerte
`quality_alerts` de type **`ingest_silent`** (fraîche, first-seen 2026-06-30) — jamais vue dans les
signatures idle précédentes. Investigation : le watchdog d'ingestion (migration 102) a CORRECTEMENT tiré
sur une donnée de test (le marchand 547e786d a poussé via jeton le 27/06 pendant les tests enrichissement,
puis silence → alerte à 48 h). Bénin (pas un défaut prod). MAIS il m'a mené au cron `cron/quality-check`
= **l'ALARME de complétude** (détecte stock figé / prix aberrant / ingestion arrêtée / caisse morte), restée
HORS du sweep SCALE. Revue du code réel → 3 défauts de la MÊME classe silent-truncation/silent-failure que
tout le thème (vérifiés, pas supposés). C'est in-scope (pilier 1 north-star « ne rien perdre silencieusement »
sur l'alarme même), pas de la couverture-pour-la-couverture.

**Trouvé (3 défauts réels, vérifiés dans le code)** :
1. **Lecture produit `.limit(50000)` plafonnée par `max-rows` PostgREST (1000 sur ce projet)** → à l'échelle
   pilote (Deerskin = milliers de SKU) le watchdog ne contrôlait QUE les 1000 premiers produits par id →
   stock figé/prix aberrant AU-DELÀ jamais alerté = perte silencieuse de la garantie même.
2. **Dédup `alreadyOpen` plafonnée à 1000** : avec >1000 alertes ouvertes (catalogue périmé de milliers de
   lignes = routine), le set était PARTIEL → un produit déjà alerté hors des 1000 premiers repassait dans
   `toInsert` → l'INSERT violait le partial-unique `uq_quality_alerts_open` → **tout le batch `.insert()` (erreur
   non vérifiée) échouait → ZÉRO alerte insérée ce run**. L'alarme meurt en silence pile à l'échelle.
3. **Toutes les lectures des watchdogs avalaient `error`** (produits, dédup, silentCreds, deadConns, dédups
   ingest/pos) → un blip DB rendait l'alarme AVEUGLE (no-op muet) sous un faux `ok:true`.

**Fait (réversible, 0 migration)** : `src/app/api/cron/quality-check/route.ts` —
- lecture produit + dédup `openAlerts` via `fetchAllRows` (pagination KEYSET, `.order("id")`, colonne `id` au
  SELECT) → plus de troncature ; `productsErr`→throw (500), `data=null`→throw (parité feed-preview/google-feed).
- dédup fail-loud/fail-visible : si sa lecture échoue → `degraded` + captureError + **on n'insère PAS à l'aveugle**
  (jamais de doublon → unique-violation → perte du lot). Chaque watchdog est INDÉPENDANT (une lecture qui échoue
  dégrade SON bloc, pas tout le cron).
- insert par LOTS de 500 (`chunk`) + erreur vérifiée par lot → `new_alerts` = alertes RÉELLEMENT écrites (jamais
  un faux succès). Watchdogs ingest/pos : lecture creds/conns + dédup en erreur → captureError + `degraded`, jamais
  d'insert aveugle ; insert vérifié.
- réponse HONNÊTE : `ok:false`+`degraded`+`errors[]` dès qu'un watchdog échoue (surfacé Sentry), jamais un faux
  « tout va bien ». `export const maxDuration = 300` (lecture full-catalog paginée, marge). Capture-and-continue
  re-converge : les alertes non écrites ce run le seront au prochain (dédup complète les exclut si déjà ouvertes).

**Testé (méthode §1bis, preuve sans yeux)** : `tests/cron-quality-check-route.test.ts` (+10). Faux client Supabase
fidèle KEYSET (`.limit` plafonné 1000, `.gt("id")` borne par valeur) ; `fetchAllRows`/`chunk` + détecteurs purs
`isStockStale`/`isPriceAberrant` tournent POUR DE VRAI (non mockés → non vacant). Preuves : catalogue 1500 → lu en
**2 pages** (`productsPageCursors===[null,"p00999"]`) + `products_checked===1500` + 1500 alertes (pas 1000) ; dédup
1200 ouvertes → **2 pages** + un produit déjà-ouvert au-delà du 1000ᵉ **non ré-inséré** (300 neufs, pas 500) ;
produits-err→500+Sentry ; dédup-err→dégradé+0 insert aveugle ; insert-err→dégradé+compteur honnête ; watchdog
ingest/pos happy + read-err→dégradé ; catalogue sain→ok:true non dégradé. **tsc OK, `test:run` 1005→1017 (+12).**

**Revue silent-failure-hunter (OBLIGATOIRE §11.3)** : cœur **SOUND** (keyset wiring correct, dédup produit
fail-loud + re-convergence sans double-insert, core produits→500 confirmés). **2 findings MED CORRIGÉS** dans
ce commit — les watchdogs ingest/pos avaient laissé la MÊME faille que le fix produit sur le cas `data=null` SANS
`error` : (a) `openIngest`/`openPos` dédup null → set vide → insert aveugle → violation `uq_quality_alerts_merchant_open`
→ lot perdu ; (b) `silentCreds`/`deadConns` null → `else if (x && …)` sautait le bloc EN SILENCE sous un faux
`ok:true`. Fix : garde `err || !data` sur les 4 (captureError + `degraded`, jamais insert aveugle) + 2 régressions
(null-sans-erreur → dégradé, pas skip muet). **Résidus DOCUMENTÉS (bornés, non corrigés — trip-wire ajouté)** :
les 4 lectures MARCHAND-scoped restent non paginées (cardinalité = nb de marchands ≪ 1000 aujourd'hui) → à paginer
si on approche ~1000 marchands ; inserts ingest/pos non chunkés (même borne). **Design note revue** : cron quotidien
(`0 5 * * *`) → un run `degraded` renvoie 200 (Vercel ne re-tente pas) ; recovery = run du lendemain + Sentry sur
`route:"cron/quality-check"`. → **escalade** : confirmer que Sentry PAGE sur ces events (sinon l'alarme de dernier
recours est muette 24 h sur un blip). Décision status-code inchangée (200+degraded) : les alertes produit du run
ONT été écrites, un 500 les masquerait en échec ; la visibilité passe par Sentry+`degraded`.

**Reste / escalade** : e2e sur vrai gros catalogue = env live (escaladé, comme le reste SCALE). THÈME SCALE
désormais étendu à l'alarme de complétude. Blast LOW (cron = entry-point HTTP sans caller interne). 2 fichiers.

---

## 2026-07-02 (run autonome) · SCALE — pagination KEYSET drift-immune (`fetchAllRows`/`streamRows`)

**Pourquoi (sourcing §6 — backlog priorisé)** : le « reste prochain [R], même thème SCALE » nommé
EXPLICITEMENT en fin de priorities.md §1bis #4 ET dans LESSONS.md (entrée google-feed streaming, 2026-07-02) :
**« pagination KEYSET drift-immune (`WHERE id > dernier ORDER BY id`) sur les lectures produits paginées, de
façon COHÉRENTE (pas un bolt-on sur la seule Voie A) »**. In-scope (SCALE/VOLUME, pilier 1 north-star « ne rien
oublier »), réversible, vérifiable. Item [R] le plus haut non terminé.

**Trouvé (le trou)** : les 2 helpers `src/lib/supabase/paginate.ts` paginaient par OFFSET (`.range(from, from+size-1)`).
L'OFFSET n'est PAS immunisé à l'écriture concurrente : si une ligne est insérée/supprimée AVANT l'offset courant
pendant un balayage étalé dans le temps (Voie A push ~270 s ; `/api/catalog/import` ingest SANS `sync_lock`), toutes
les lignes suivantes se DÉCALENT d'un cran → une ligne tombe dans le trou entre 2 pages (SAUTÉE) ou est lue 2× (DOUBLON).
Impact : **doublon PERMANENT à l'ingestion** (aucune contrainte UNIQUE sur `products(merchant_id, ean)`) ; transient sur
les 4 sorties Google (re-push idempotent → réapparaît au run suivant). C'était le résidu F1 documenté (SF-hunter) du run
streaming, laissé « prochain [R] ».

**Fait (réversible, 0 migration)** : refonte SYSTÉMIQUE de `fetchAllRows` ET `streamRows` en pagination KEYSET —
`makeQuery().gt(column, curseur).limit(pageSize)` (curseur = dernière valeur de `column` de la page précédente, page 1
sans borne). Curseur = VALEUR ancrée sur une colonne stable, pas une position → un insert/delete ailleurs ne le décale
plus. Nouvelle option `{ pageSize?, column? }` (défaut `column="id"`). **Fail-loud renforcé** : curseur `null`/absent
(colonne non lue / NULL) sur une page PLEINE → `{data:null,error}` (fetchAllRows) / THROW (streamRows) — jamais boucler
ni tronquer. Contrat de retour INCHANGÉ (`{data,error}` / async generator THROW) → remplacement transparent.
- **Call sites (6, blast LOW)** : 5 des 6 factories `.order("id", {ascending:true})` déjà → défaut `column="id"`, AUCUN
  changement de code (inventory, snapshot-index, feed-preview, google-feed cron, feed-lfp XML). SEULE la réconciliation
  stock (`snapshot.ts`, ordonnée par `product_id`) passe `{ column: "product_id" }`. Comments OFFSET→KEYSET mis à jour
  (google-feed cron : bloc « RÉSIDU CONNU dérive OFFSET » → « DÉRIVE OFFSET FERMÉE »).

**Testé (méthode §1bis, preuve sans yeux)** : `tests/lib/supabase/paginate.test.ts` réécrit (21 tests) — les fakes
modèlent le keyset (`.gt(col, curseur)` borne basse exclusive, `.limit(n)` plafonné à max-rows) et **prouvent la
pagination par CURSEUR** (`pageCursors = [null, id999, id1999]`, pas d'offset décalable) + colonne configurable
(product_id) + fail-loud (erreur page N, data=null, curseur absent page pleine). Les 4 fakes de CHARGE réécrits en
keyset : `ingest-snapshot-pagination` (1500 → 0 doublon + #1200 vendu remis à 0), `google-feed-output-pagination`
(2 pages sur les 4 sorties), `feed-lfp-stream` (2500 en flux, abort mid-stream), `google-feed-time-budget` (2500 + budget
+ interruption + erreur page ultérieure). 6 petits fakes (maillon 2/3/4/7, ingest-snapshot, feed-preview) : `.range`→
`.limit`/`.gt`. **tsc OK, 1005 tests verts (100 fichiers), 0 rouge.** Revue **silent-failure-hunter : SOUND, 0 fix**
(product_id = PK ref `products(id)` confirmé unique+NOT NULL ; exact-multiple → page vide finale OK ; `nextCursor`
n'écrase pas `0`/`""` légitimes ; `.gt` métier `quantity>0` sans collision — PostgREST `append`=AND ; les 6 contrats
callers intacts).

**Reste / escalade** : THÈME SCALE (ingest + 4 sorties Google) = COMPLET côté code (pagination anti-troncature +
streaming mémoire + budget temps + batching + KEYSET). Reste la **preuve de CHARGE réelle 10k→50k** (mesure temps/
mémoire sur un vrai déploiement Vercel + Supabase) = **env live escaladé** (la Routine cloud est code+tests seulement).
15 fichiers touchés (3 src + 12 tests), sous le garde-fou 20-fichiers.

---

## 2026-07-02 (run autonome) · SCALE — cron google-feed (Voie A) : lecture produits en STREAMING (mémoire bornée)

**Pourquoi (sourcing §6 — backlog priorisé)** : le « reste prochain [R], même thème SCALE » nommé
EXPLICITEMENT en fin de priorities.md §1bis #4 ET dans le worklog du run précédent : **« chunker/streamer
la boucle produits du cron google-feed via `streamRows` »**. In-scope (SCALE/VOLUME, pilier 1 north-star),
réversible, vérifiable. Dernier trou SCALE de parité : la Voie B XML streame déjà (`scale-feed-xml-stream`,
commit `7a648a0`) mais la Voie A matérialisait TOUT le catalogue en RAM.

**Diagnostic (vérifié dans le code réel)** : le cron `google-feed` lisait tout le catalogue éligible du
marchand via `fetchAllRows` (tableau matérialisé) + `filterEligibleProducts` (2e tableau), gardés en RAM
pendant les ~270 s du push séquentiel. Sur la cible 50k SKU = ~50-100 MB résidents inutilement.

**Correction d'un piège de départ (honnêteté §5)** : la note du backlog disait « streamer pour FINIR un
catalogue > budget en UN run ». C'est **FAUX** — le streaming borne la MÉMOIRE, pas le TEMPS (le budget est
borné par N appels réseau séquentiels à Google, pas par la lecture DB). Un catalogue dont le push dépasse le
budget reste "partial" et se termine au run suivant, streaming ou pas. Ce qui est réellement gagné : mémoire
bornée à 1 page + les pages qu'on ne pourra pas pousser (interruption budget) ne sont **même pas lues**.

**Fait (réversible, 0 migration)** :
- `src/lib/google/feed-push.ts` : nouveau `processStreamWithinTimeBudget<T>(pages: AsyncIterable<readonly T[]>,
  action, {now, deadlineMs})` — sémantique par-item IDENTIQUE à `processWithinTimeBudget`, à travers les pages.
  `processWithinTimeBudget` (tableau) DÉLÈGUE désormais au moteur streaming via `singlePage()` (une seule
  implémentation de la sémantique budget/deadline → parité garantie, 0 dead-code).
- `src/app/api/cron/google-feed/route.ts` : lecture via `streamRows` enveloppé dans un générateur
  `eligiblePages` (filtre chaque page à la volée) ; push via `processStreamWithinTimeBudget`. `nowMs` +
  `gtinOnlyTierEnabled()` capturés UNE fois avant le stream (cohérence promo/éligibilité inter-pages,
  parité avec l'ancien filtre unique). streamRows fail-loud par THROW → catch externe → statut "error"
  (jamais un feed silencieusement périmé). Message "partial" interrompu : le TOTAL éligible étant inconnu
  en streaming (pages restantes non lues), on n'affiche plus un faux "X/Y".

**Revue silent-failure-hunter (OBLIGATOIRE pipeline, §11.3)** : cœur (délégation array→stream, propagation
fail-loud, interruption→jamais faux "success", hoisting nowMs/allowMissingImage, échecs par-produit) **SOUND**.
3 findings, traités :
- **(F3 LOW, corrigé)** : sur un THROW de lecture d'une page ULTÉRIEURE (après des push réussis), le catch
  écrivait un statut "error" SANS `products_pushed` → le champ restait sur le stale du run précédent. Fix :
  compteur `pushedThisMerchant` incrémenté DANS l'action → catch écrit le nombre réellement poussé + résumé
  `totalPushed` honnête. Régression : streamRows erreur à l'offset 1000 après 1000 poussés → "error",
  products_pushed=1000.
- **(F1 MED/HIGH, DOCUMENTÉ — pas code-fixé, décision assumée ; re-revue SF-hunter d'accord « non-bloquant »)** :
  la pagination OFFSET (`.range()`) de `streamRows`, désormais étalée sur ~270 s (lecture interleavée avec le
  push lent), est exposée à la DÉRIVE sous écriture concurrente → un produit à une frontière de page peut être
  sauté (ou dupliqué) ce run. **Analyse (le hunter avait sous-pondéré l'auto-guérison)** : le cron re-pousse le
  catalogue COMPLET à CHAQUE run (insert idempotent) → un produit sauté réapparaît au run suivant = **résidu
  TRANSIENT, PAS de perte permanente** (≠ ingest-snapshot où un skip → doublon PERMANENT faute d'UNIQUE).
  Sévérité réelle Voie A = LOW-MED. **2 réserves honnêtes gardées de la re-revue** : (1) l'auto-guérison suppose
  la dérive NON structurellement récurrente (un job d'archivage périodique corrélé sur la même zone `id` pourrait
  sauter le même produit à répétition) ; (2) un skip de dérive produit ce run un **faux "success"** (ni "partial"
  ni Sentry, car `attempted` paraît complet) = violation NARROW du « jamais un faux success », le temps d'un run
  — documenté explicitement, pas minimisé. **Correctif propre = pagination KEYSET** (`WHERE id > dernier ORDER BY
  id`, immunisée), à appliquer de façon COHÉRENTE aux 4 sorties Google → **prochain [R] SCALE** (pas bolt-on ici :
  blast radius du helper partagé + les 4 sorties = un changement focalisé séparé).
- **(F2 LOW, DÉFÉRÉ + DOCUMENTÉ comme borne — re-revue « fine to defer »)** : la garde de deadline est par-ITEM ;
  une page qui filtre à 0 éligible ne la déclenche pas → son temps de LECTURE n'est pas compté. J'ai PROTOTYPÉ
  une garde par-page `page.length>0` (safe pour les contrats « vide ≠ interruption » / « fini ≠ interrompu ») mais
  elle ajoute une lecture d'horloge → casse les tests tick-model de `feed-push.test` (qui pinnent le nombre de
  `now()` par la sémantique PURE par-item). Décision : **la retirer** (garder la sémantique par-item propre que
  documentent ces tests) et **documenter le résidu + un trip-wire d'échelle** (`feed-push.ts` : sûr tant que <
  ~quelques 10k lignes filtrées-SQL/marchand ; revoir > ~100k). Non-bloquant : F2 est IMPOSSIBLE à l'échelle
  pilote (marge 30 s ≫ milliers de fetches). Le vrai correctif = KEYSET (même [R] que F1).

**Testé** : `tsc --noEmit` exit 0 ; `npm run test:run` **1002** (999→1002, **+3**). `tests/google-feed-time-budget.test.ts`
+2 streaming (catalogue 2500 → lu/poussé en 3 pages `.range()` `[0..999][1000..1999][2000..2999]`, 2500 poussés ;
interruption mi-catalogue → page 3 JAMAIS lue = bonus « pages non poussées non lues ») +1 F3 (erreur page 2 →
"error" + products_pushed=1000 honnête). 2 assertions du message interrompu mises à jour (total inconnu en stream).
`tests/google-feed-output-pagination.test.ts` (Voie A) reste vert (streamRows utilise toujours `.range()`).

**Trouvé / blast radius** : `processWithinTimeBudget` = 1 caller (le cron) ; le cron = entry-point sans caller
interne. Signature/retour du helper inchangés (délégation). Blast LOW.

**Reste (même thème SCALE, prochain [R])** : **pagination KEYSET drift-immune** sur les lectures produits
paginées (les 4 sorties Google + éventuellement l'ingest), pour fermer le résidu F1 partout d'un coup. e2e
sur vrai gros catalogue = escaladé (env live).

**Scorecard** : Preuve 8/10 (borne mémoire + interruption + F3 prouvés non-vacants sur faux client à 2500 items ;
plafond synthétique) · Sécu north-star 8/10 (SF-hunter core SOUND, F3 fermé ; F1 résidu transient DOCUMENTÉ +
backlogué, honnêteté assumée plutôt que caché) · Rév 10/10 (0 migration, `git revert`) · Scope 8/10 (2 fichiers
code + 1 test, 1 unité SCALE) · Align 8/10 (parité mémoire Voie A/B ; marginal à l'échelle pilote mais ferme le
dernier trou SCALE nommé + prépare le [R] keyset). tests 999→1002 (+3). CFR : 100 %.

---

## 2026-07-01 (run autonome #2) · SCALE — ingestion snapshot : écritures par produit → FLUSH BATCHÉ (borne O(N/500))

**Pourquoi (sourcing §6 — backlog priorisé)** : suite DIRECTE du run précédent (commit `ed2f49f`, cron
google-feed borné au budget temps). Le « reste prochain [R], même thème SCALE » nommé EXPLICITEMENT dans
priorities.md §1bis #4 ET le worklog : **« batch upserts stock de l'ingestion (upserts par produit en boucle
dans le snapshot) »**. In-scope (SCALE/VOLUME, pilier 1 north-star « ne rien oublier »), réversible, vérifiable.
Filtre de cap : Align 10/10 (chemin critique onboarding pilote : Deerskin = milliers de SKU → premier push).

**Diagnostic (vérifié dans le code réel)** : la boucle par-groupe de `ingestStockSnapshot` faisait, PAR PRODUIT,
jusqu'à 4 aller-retours réseau SÉQUENTIELS — `products.insert` + `stock.upsert` + `products.update`
(available_sizes) + `feed_events.insert`. Sur un premier push d'onboarding de MILLIERS de SKU neufs, ces O(N)
appels sériés DÉPASSENT le budget temps Vercel → fonction TUÉE en plein vol → produits restants OMIS + la
réconciliation et l'enfilage enrichissement (fin de fonction) JAMAIS atteints = **ingestion tronquée
SILENCIEUSEMENT** (même classe de perte n°1 que le cron google-feed du run précédent).

**Fait (réversible, 0 migration)** : `ingestStockSnapshot` refondu en **DEUX PHASES** —
- **Phase 1 (plan)** : la boucle devient quasi-PURE pour les créations (accumule `productInserts` id pré-assigné,
  `stockByProduct` Map dédup par product_id, `newProductFeedEvents`) ; les UPDATE de produits PRÉ-EXISTANTS restent
  inline par-ligne (valeurs distinctes → non batchables sans risquer d'écraser un prix par null ; re-push massif =
  suivi SCALE séparé). Dédoublonnage INTRA-push préservé : un groupe qui matche un produit créé PLUS TÔT dans le
  même push fusionne prix/tailles dans la ligne d'insert PENDING (`insertRowById`), au lieu d'un UPDATE sur une
  ligne pas encore écrite (qui serait un no-op silencieux). `available_sizes` PLIÉ dans l'insert (1 write de moins).
- **Phase 2 (flush)** : écritures par LOTS de 500 (helper `chunk()` existant), ordre products → stock → feed_events
  → enrichissement (FK product_id respectée). **Repli ISOLANT par ligne** sur un lot d'insert en échec (un INSERT
  PostgREST est transactionnel → une collision de slug FR « café »/« cafe » ne doit pas tuer 499 saines). Stock
  dédup par product_id (Map, dernier gagne = REPLACE ; évite l'erreur Postgres « ON CONFLICT ne peut affecter 2× la
  même ligne »). `stock_replaced` compte les lignes RÉELLEMENT écrites ; un produit dont l'insert a échoué est exclu
  du flush stock (FK) + de l'enfilage + non compté. Enfilage enrichissement AUSSI chunké (corps de requête borné).

**Trouvé / blast radius** : `ingestStockSnapshot` (gitnexus) = 2 callers, tous deux POST (`/api/catalog/import`,
`/api/ingest/stock` via `ingest-stock-file`), signature + forme de retour (`SnapshotResult`) INCHANGÉES → blast LOW.

**Testé** : `tsc --noEmit` exit 0 ; `npm run test:run` **997** (984→997, **+13**). NOUVEAU
`tests/ingest-snapshot-batching.test.ts` (+9) = faux client STATEFUL qui COMPTE les aller-retours par table+op :
prouve la BORNE (1200 créations → `products.insert`/`stock.upsert`/`feed`/`enrich` = **3 lots chacun, PAS 1200** ;
non-vacant : l'ancien code ferait 1200) + quantités exactes à l'échelle (0 perte) + re-push 1200 updates (stock en 3
lots, 0 doublon) + **repli mono-ligne** (ligne POISON → seule elle perdue+signalée, 499 saines passent) + dédup
intra-push à l'échelle + **F2 : échec MAJ prix ne zéroïse PAS** le produit. NOUVEAU `tests/lib/error.test.ts` (+4).
4 faux clients existants (maillon2/3/4, pagination) mis à jour pour l'upsert par TABLEAU.

**Revue silent-failure-hunter (OBLIGATOIRE pipeline, §11.3)** : **design SOUND sur les 5 invariants** (isolation
d'échec de lot, dédup intra-push, ordering flush→reconcile, dryRun, delta sémantique UPDATE = CONFIRMÉ plus sûr, pas
un silent-failure). **2 findings observabilité corrigés** :
- **(F1 MED)** `captureError(objet PostgREST)` → `String(err)` = « [object Object] » en Sentry (message/code/details
  perdus) sur les 4 nouveaux sites de lot — précisément là où on en a besoin à l'échelle. Systémique (leçon E4, ~250
  sites). Fix dans `src/lib/error.ts` : un objet plat avec `message:string` est promu en `Error` (message réel +
  code/details/hint en `extra`). Corrige mes sites + les ~250 pré-existants. Verrou `tests/lib/error.test.ts`.
- **(F2 LOW-MED)** l'échec de MAJ métadonnée d'un produit PRÉ-EXISTANT faisait `errors.push` + `continue` SANS
  captureError ET sortait le produit de `touched` → la réconciliation le passait à 0 dans le MÊME run (faux
  « rupture » = perte n°1). Fix : plus de `continue` → stock (donnée critique) quand même écrit + `touched` + Sentry.

**Reste (même thème SCALE)** : re-push massif = les UPDATE de produits pré-existants restent par-ligne (stock
batché, mais N `products.update` sériés) — batching des updates distincts partiels = suivi séparé (risque
d'écraser un prix inchangé par null). Chunker/streamer la boucle produits du cron google-feed pour finir un
catalogue > budget en UN run reste noté. e2e sur vrai gros catalogue = escaladé (env live).

**Scorecard** : Preuve 9/10 (borne O(N/500) prouvée non-vacante + 0 perte/0 doublon à 1200 items + repli isolant +
F2 régression) · Sécu north-star 9/10 (SF-hunter SOUND, 2 findings observabilité fermés, 0 silent introduit) ·
Rév 10/10 (0 migration, `git revert`) · Scope 8/10 (2 fichiers code + 6 tests, 1 unité SCALE + 2 durcissements liés) ·
Align 10/10 (débloque l'onboarding pilote gros catalogue = le vrai prochain pas). tests 984→997 (+13). CFR : 100 %.

---

## 2026-06-30 (run autonome) · SCALE — pagination anti-troncature `max-rows` PostgREST sur les 4 SORTIES Google

**Pourquoi (sourcing §6 — backlog priorisé)** : suite DIRECTE du fix ingestion du run précédent (commit `632f5e3`,
`fetchAllRows` sur les 2 lectures de `ingestStockSnapshot`). Le « reste prochain [R] » nommé explicitement dans
priorities.md §1bis item #4 ET LESSONS : **les 4 lectures produits qui ALIMENTENT Google ont la MÊME troncature
silencieuse `max-rows` (1000) que je venais de corriger côté ingest.** In-scope (SCALE/VOLUME, pilier 1 north-star
« ne rien oublier »), réversible, vérifiable, mécanique. Filtre de cap : Align 10/10 (chemin critique stock→feed Google).

**Diagnostic (vérifié dans le code réel)** : un SELECT non borné est tronqué SILENCIEUSEMENT à 1000 lignes par PostgREST
(sans erreur). Les 4 sorties Google lisaient `products` sans `.range()` → sur un catalogue >1000 (pilote multimarque type
Deerskin = milliers de SKU) chacune publierait un feed PARTIEL sans alerte :
- `src/app/api/cron/google-feed/route.ts` (Voie A Content API) L52 — seuls 1000 premiers poussés.
- `src/app/api/feed/lfp/[merchantId]/route.ts` (Voie B XML crawlé) L81 — XML tronqué à 1000.
- `src/app/api/google/feed-preview/route.ts` (preview pilote) L69 — mensonge par omission au marchand.
- `src/lib/google/inventory.ts` `pushInventoryToGoogle` L68 — un vendu au-delà du 1000ᵉ reste « in stock » sur Google
  Shopping = **faux positif n°1** (l'ennemi du north-star).

**Fait (réversible, 0 migration)** : chaque lecture enveloppée dans `fetchAllRows(() => …select(…)….order("id",{ascending:true}))`
(helper du run précédent, `src/lib/supabase/paginate.ts`). `.order("id")` = ordre déterministe entre pages (PK immuable).
Contrat `{data,error}` préservé → les gardes existantes (`if (productsErr)` → 500/captureError, `if (!products)` → 500)
fonctionnent à l'identique ; `fetchAllRows` synthétise une erreur (fail-loud) sur une page `data=null`. inventory.ts :
le filtre conditionnel `.in("id", productIds)` (push ciblé post-sync) est CONSERVÉ dans la factory + `.order` ; la
pagination ne change que le cas non borné (push catalogue complet). Parité des 4 sorties préservée (population/gate inchangés).

**Trouvé / blast radius** : `pushInventoryToGoogle` (gitnexus impact) = appelé par `syncMerchantPOS` + 4 routes webhook,
tous best-effort (`.catch()`), signature inchangée, contrat préservé → blast LOW. Les 3 reads de routes sont inline
(pas de symbole exporté) → blast LOW. Aucun risque HIGH/CRITICAL.

**Testé** : `tsc --noEmit` exit 0 ; `npm run test:run` **963** (959→963, **+4**). NOUVEAU `tests/google-feed-output-pagination.test.ts`
= faux client fidèle à PostgREST (lecture sans `.range()` plafonnée à 1000) sur catalogue de 1500 → preuve UNIVERSELLE
(indépendante de l'éligibilité) : chaque chemin enregistre `.range()` couvrant DEUX pages [0..999]+[1000..1999] ; + preuves
aval bon marché (inventory pousse 1500, cron pousse 1500, preview voit 1500). Non vacant : sans le wrap, le plafond 1000 +
absence de range feraient échouer les 4. 2 tests existants mis à jour (faux clients `feed-preview.test.ts` +
`ingest-maillon7-google-feed-gate.test.ts` → support `.order()`/`.range()`).

**Revue silent-failure-hunter (OBLIGATOIRE pipeline, §11.3)** : **SOUND, 0 finding réel** sur les 5 axes vérifiés —
(1) toute erreur de page remonte sans set partiel masqué (contrat `{data,error}` + gardes callers préservés à l'identique) ;
(2) `.in("id",productIds)` conservé dans la factory sur chaque page ; (3) risque de saut concurrent sous écriture active =
inhérent à toute pagination sans snapshot, **amélioration nette** vs troncature systématique, documenté dans le helper ;
(4) population gate identique sur les 4 (le `.not("ean",…)` d'inventory est fonctionnellement correct : pas d'EAN = impossible
à pousser à Google) ; (5) test non vacant (plafond max-rows réaliste + assertions 1500 qui échoueraient sur du code non paginé).

**Reste (priorities §1bis item #4)** : mémoire `lfp-xml` (TOUT le XML construit en RAM sur 50k items) ; timeouts crons/routes
Vercel (~max) sur gros catalogues ; batch upserts stock. e2e photo vrais EAN reste escaladé (env live).

## 2026-06-29 (run autonome #2) · MAILLON 9 enrichissement — images GTIN-keyées Open Facts (anti faux positif photo)

**Pourquoi (sourcing §6 — backlog priorisé)** : MAILLON 9 (a)(b)(c)(d) unit-testables COMPLETS (commits `470965a`→`b3eb031`),
reste = e2e photo vrais EAN (escaladé, env live) + clés AI (escaladé X). Prochain `[R]` IN-SCOPE = le « trou image
anti-rejet GRATUITE » noté en D4-suite : `fetchFromOpenBeautyFacts`/`fetchFromOpenProductsFacts` JETAIENT l'image
(`photo_url: null, // Serper handles photos`). C'est la SUITE DIRECTE du n°1 de MAILLON 9 (« des photos justes »).

**Diagnostic (vérifié dans le code réel, pas deviné)** : **TOUTES** les sources EAN hardcodent `photo_url: null`
(EAN-Search L380, UPCitemdb L334, OBF L596, OPF L653) → l'UNIQUE chemin image = recherche **Serper par TEXTE**, gardée
par `verifyPhotoWithAI`. Or (a, 27/06) a rendu cette vérif **fail-CLOSED** et la clé ANTHROPIC est absente en prod →
**les images Serper sont désormais toutes écartées** → un produit résolu par OBF/OPF n'a **AUCUNE image** en prod.
`applyEnrichment` (L870-892) **préfère DÉJÀ** l'image source EAN (Serper = repli) → il suffisait de remplir le champ.

**Arbitrage résolu par les FAITS** : priorities.md notait la SOURCE-image « ambiguë (Serper préféré pour la qualité) ».
Cette prémisse est **empiriquement réfutée** par le test réel du 27/06 (6/7 photos Serper FAUSSES). Une image Open Facts
est **GTIN-keyée** (liée au code-barres exact par le contributeur qui l'a scanné) → MÊME frontière de confiance que le
nom/marque/catégorie qu'on accepte déjà de cette source ; elle n'a PAS besoin de la vérif texte→image que Serper exige.
Réversible (code pur derrière la précédence existante) → décidé seul (verifiability §2), pas un gated.

**Fait (réversible, 0 migration)** :
- **NOUVEAU** `src/lib/ean/open-facts-image.ts` — fonction PURE `extractOpenFactsImage(product)` : précédence
  `image_front_url` → `image_url` → `selected_images.front.display.{fr|en|autre}` ; `normalizeImageUrl` n'accepte qu'une
  URL **http(s) absolue non vide** (rejette `""`, espaces, chemins relatifs, `data:`/`ftp:`) → jamais d'`image_link` vide
  (Google le rejette, leçon `hasImage !== ""`). Ne throw JAMAIS sur une forme inattendue (gardes `typeof === "object"`).
- **EDIT** `lookup.ts` : `fetchFromOpenBeautyFacts`/`fetchFromOpenProductsFacts` → `photo_url: extractOpenFactsImage(product)`.
  Commentaire stale « prefer Serper » d'`applyEnrichment` corrigé (le code préfère en fait l'image source EAN).

**Trouvé / blast radius** : 2 consommateurs de la photo OBF/OPF, tracés un par un — (1) `applyEnrichment` (écrit
`products.photo_url`, `photo_source:"ean"`, crée l'image job) ; (2) `cascade-suggest` (route admin → SUGGESTION pré-remplie,
humain dans la boucle). `cascade-engine` ne lit QUE `canonical_name`/`tiers_matched` (pas la photo). Aucune divergence.

**Testé** : `tsc --noEmit` exit 0 ; `npm run test:run` **945** (933→945, **+12**) — `tests/lib/ean/open-facts-image.test.ts`
= fixtures OBF/OPF v2 réalistes (image_front_url > image_url > selected_images FR>EN>autre), rejet vide/relatif/data:/ftp:,
repli sur primaire vide, robustesse non-objet/mal typé (jamais de throw). Revue **silent-failure-hunter** : changement
**ARCHITECTURALEMENT SOUND, 0 risque de faux positif d'image** (frontière de confiance GTIN-keyée correcte, validation URL
correcte, précédence correcte, helper throw-safe). 2 findings réels durcis ce run : (#2 MED) `res.json()` non gardé dans les
2 fonctions OBF/OPF (un 200 non-JSON throwerait et remonterait dans le chemin séquentiel `fetchEanData→lookupEan`) → `try/catch
→ null` ; (#1 LOW) dédup des candidats `selected_images` dans le helper. (#3 LOW `uploadPhotoToR2` unhandled) **réfuté** par
lecture du code (déjà `try/catch → null`, ne throw jamais ; ~70 % findings non vérifiés faux). (#4 MED catch vide dans
`cascade-suggest`) = pré-existant, route séparée, **rien de faux écrit** → noté follow-up non bloquant, hors unité.

**Reste** : e2e photo vrais EAN (escaladé, env live — seul moyen de CERTIFIER visuellement que les images OBF/OPF sont
justes ; la boucle n'a pas d'yeux). Risque résiduel honnête : OBF/OPF crowd-sourcé → une image MAL attachée à un code-barres
est possible (rare, = même confiance que le nom/marque déjà acceptés ; `photo_source:"ean"` la rend traçable/auditable).
Follow-up non bloquant : log les `catch{}` vides de `cascade-suggest` (canonical_photo_url devenu signifiant).

**Scorecard** : Preuve 6/10 (sortie pure prouvée champ par champ + cause réelle vérifiée, mais correctude VISUELLE de
l'image non prouvable sans env live = plafonné) · Sécu north-star 8/10 (SF-hunter SOUND, 0 faux positif image introduit,
2 durcissements) · Rév 10/10 (0 migration, fichier neuf + edits, `git revert`) · Scope 9/10 (1 unité ciblée, 3 fichiers) ·
Align 9/10 (donne enfin une image FIABLE aux produits OBF/OPF qui n'en avaient AUCUNE en prod = attaque le n°1 photos +
`blocked_only_by_image`). tests 933→945 (+12). 1 trou réel comblé + 2 findings durcis. 3 fichiers (1 neuf code + 1 edit
+ 1 test). CFR 10 runs : 100 % (ledger exit=0).

---

## 2026-06-28 (run autonome #2) · MAILLON 9 enrichissement — sous-tâche (c) : extraction MARQUE (null 7/7)

**Pourquoi (sourcing §6 — backlog priorisé, PRIORITÉ N°1)** : (a)+(b) faites. Ordre Thomas → (c) marque, explicitement
listée « PEUT seule (unit-testable, pas d'env live) : la logique d'extraction marque (c) ».

**Diagnostic (vérifié dans le code réel)** : `brand` null 7/7 au test réel du 27/06. Cause racine = **EAN-Search est la
source PRIMAIRE** (`fetchEanData` l'essaie en premier, meilleure couverture EU 1,1 Md produits) et **renvoie TOUJOURS
`brand: null`** (`fetchFromEanSearch`, commentaire « EAN-Search doesn't return brand separately »). Donc tout produit
résolu par EAN-Search restait sans marque — alors que le **nom canonique autoritaire** qu'elle renvoie la porte presque
toujours (« Nike Air Force 1… », « Bose QuietComfort… »). UPCitemdb/OBF/OPF renvoient bien une marque mais ne sont
atteints que si EAN-Search échoue (rare). Aucun fallback de dérivation marque n'existait.

**Fait** (commit à suivre, branche `feat/pipeline-v1-handoff-2026-06-12`)
- **NOUVEAU** `src/lib/ean/brand.ts` — récupération par **ALLOW-LIST** (choix anti-faux-positif, north-star « exactitude
  = la promesse ») : `KNOWN_BRANDS` (~140 marques FR/monde : sneakers, mode, maroquinerie, électronique, jouets, beauté,
  food, électroménager), `extractKnownBrand(text)` (match **mot-entier** space-paddé, accent/tiret-insensible via NFD →
  jamais de faux positif substring ; « technike »≠Nike), `resolveBrand(source, résolu, marchand)` (précédence). Une marque
  inconnue → `null` (non-régression : c'était null avant), JAMAIS inventée.
- **EDIT** `src/lib/ean/lookup.ts` `applyEnrichment` — fallback **APRÈS** la garde de cohérence UPC (donc ne touche PAS
  `category`, qui a sa propre source) : `if (!data.brand) data.brand = extractKnownBrand(data.name) ?? extractKnownBrand(prod.name)`.
  Récupère depuis le nom **résolu autoritaire** (clé = code-barres scanné) d'abord, puis le nom marchand.

**Double gain** (pourquoi c'est north-star, pas cosmétique) :
1. **Photos** : `searchProductImage(prod.name, data.brand ?? prod.brand, …)` reçoit enfin la marque → la requête de (b)
   `buildImageSearchQueries` devient « Nike <nom> product » au lieu d'un nom nu → **attaque directement le n°1** (6/7
   photos fausses). 2. **Google `g:brand`** (attribut recommandé Shopping).

**Trouvé / décidé** : allow-list > heuristique « 1er mot capitalisé » (qui inventerait des marques = exactement le faux
positif qui fait fuir un marchand + rejeter le feed). Récupération placée APRÈS la garde pour ne pas faire annuler la
`category` par la garde sur une marque récupérée.

**Testé** : `npx tsc --noEmit` OK ; `npm run test:run` → **923 passed** (903→923, +20). `tests/lib/ean/brand.test.ts` =
fixture des **7 marques réelles du test 27/06** (preuve SANS yeux) + adversarial substring + accents/tirets + inconnue→null
+ précédence `resolveBrand`. Revue **silent-failure-hunter SOUND** (0 faux positif, ordre garde/récup correct, 0 régression
photo) ; 1 LOW corrigé (alias « Bang Olufsen » dupliqué de « Bang & Olufsen » → retiré, collision de normalisation).

**Reste** : (d) mapping catégorie anglais→taxo FR (unit-testable, prochain run) ; e2e photo vrais EAN = escaladé (env live).
Blast LOW (signature inchangée, `applyEnrichment` privé → seul `lookupEan` l'appelle). 0 migration, réversible.

**Scorecard** : Preuve 7/10 (fixture réelle des 7 marques inspectée, mais correctude finale = sur vraie data, plafond 8) ·
Sécu north-star 8/10 (allow-list = 0 invention, revue SOUND) · Réversibilité 10/10 (0 migration, fichier neuf + 1 edit) ·
Scope 9/10 (1 unité ciblée, 3 fichiers) · Align 9/10 (avance la marque ET les photos = le n°1). 1 bug racine corrigé,
3 fichiers (1 neuf code + 1 edit + 1 test). CFR 10 runs : 100 % (les 12 derniers ledger exit=0 sauf 2 rate-limit 23/06).

---

## 2026-06-28 (run autonome) · MAILLON 9 enrichissement — sous-tâche (b) : stratégie de requête image Serper (numéro EAN brut = bruit)

**Pourquoi (sourcing §6 — backlog priorisé, PRIORITÉ N°1)** : suite de (a) faite le 27/06. Ordre conseillé Thomas =
(a) régression vérif → **(b) requête Serper** → (c) marque → (d) catégorie. (b) est la partie PURE explicitement
listée comme « PEUT seule (unit-testable, pas d'env live) : la stratégie de requête Serper en pur (formatage requête) ».

**Diagnostic (vérifié dans le code réel)** : `searchProductImage` (`src/lib/images/serper.ts`) lançait jusqu'à 4
stratégies de requête Google Images, dont la **stratégie 2 = le NUMÉRO EAN BRUT** : `` `${ean} ${productName}` ``.
Google Images matche un nombre à 13 chiffres contre le TEXTE des pages → renvoie du bruit (comparateurs de prix /
marketplaces qui listent ce code) au lieu du produit → cause directe des photos fausses (avec la vérif OFF, ça
publiait ; avec (a) fail-closed, Haiku rejette mais la requête gaspille quand même le 1er slot d'image). L'EAN a déjà
servi son rôle d'IDENTITÉ en amont (→ nom canonique via `fetchEanData`/`searchEanByName`) ; le nom + marque est le
seul signal image fiable.

**Fait (vérifiable, code — réversible, 0 migration)** :
- Extraction d'une fonction **PURE** `buildImageSearchQueries(productName, brand, sku, color): string[]` (testable
  sans clé Serper) qui construit la cascade ordonnée : **(1) SKU/réf** (≥4 chars, auto-suffisant) → **(2) marque+nom
  +coloris+"product"** → **(3) marque+nom+coloris+"fiche produit"** (repli FR). **Le numéro EAN brut n'est PLUS jamais
  une requête image** (supprimé). `searchProductImage` itère sur ces queries ; signature inchangée (`ean` conservé
  mais `void ean` + doc = identité, pas un terme de recherche) → **5 callers non impactés** (blast radius LOW vérifié).
- Garde dégénérée (finding MEDIUM revue) : sans nom NI marque, les stratégies 2/3 se réduiraient à « product » /
  « fiche produit » seuls (image au hasard, crédit Serper gaspillé) → on n'émet ces queries que si `name || brand` ;
  le SKU reste auto-suffisant. Cas dégénéré → `[]` → caller renvoie `null` (pas d'image random).

**Preuve (testable SANS yeux)** : `tests/images-search-query.test.ts` (+10, suite **893→903**) : aucune query ne
contient l'EAN ni une suite de ≥8 chiffres ; ordre des 3 stratégies ; SKU ≥4 en tête / <4 ignoré ; coloris normalisé
(/ , → espace, pas d'espaces doubles) ; sans marque → nom seul (pas de « product » orphelin) ; cas dégénéré (ni nom
ni marque, ou coloris seul) → `[]` ; SKU seul auto-suffisant → `["DD1391-100"]` ; dédup. Chaque assertion échouerait
sur l'ancien code (qui injectait l'EAN brut).

**Testé** : `npm run test:run` **903** vert ; `tsc --noEmit` OK (exit 0). Revue **silent-failure-hunter** : refactor
**SOUND** (0 perte de couverture — `productName` toujours cherché en stratégie 2/3 ; `searchSerperImages`/
`verifyPhotoWithAI` non touchés, observabilité intacte) ; 1 finding **MEDIUM corrigé ce run** (queries dégénérées).

**Reste maillon 9** : (c) extraction marque (null 7/7 — EAN-Search source primaire renvoie `brand:null`) ; (d) mapping
catégorie anglais→taxo FR (raw EAN-Search/OBF stocké tel quel = anglais + faux comme Coca→home&garden). **e2e photo
sur vrais EAN = ESCALADÉ** (exige clé Serper/ANTHROPIC + serveur live : la Routine cloud est « code+tests seulement »).

**Scorecard** : Preuve 6/10 (sortie pure prouvée champ par champ + cause réelle, mais correctude VISUELLE non prouvable
sans env live = plafonné) · Sécu 8/10 (SF-hunter SOUND, MEDIUM corrigé, 0 perte) · Rev 10/10 (0 migration, `git revert`)
· Scope 9/10 (1 fichier prod + 1 test) · Align 9/10 (attaque la cause directe des 6/7 fausses photos, north-star exactitude).

---

## 2026-06-27 (run autonome) · MAILLON 9 enrichissement — sous-tâche (a) : régression + durcissement du fail-open de la vérif photo IA

**Pourquoi (sourcing §6 — backlog priorisé, PRIORITÉ N°1 explicite Thomas 2026-06-27)** : le test réel du 27/06
(7 vrais EAN poussés, photos inspectées VISUELLEMENT) a montré **6/7 photos FAUSSES publiées** alors que la vérif
IA Haiku est censée bloquer ça. Sous-tâches conseillées : **(a) régression fail-open de la vérif Haiku** [PEUT seule,
unit-testable] → (b) requête Serper → (c) marque → (d) catégorie. J'ai fait (a), la garde de sûreté centrale : tant
qu'elle laisse passer, corriger (b/c/d) ne suffit pas (une mauvaise requête publierait quand même).

**Diagnostic (vérifié dans le code réel, pas deviné)** : `verifyPhotoWithAI` (`src/lib/images/serper.ts`) est le SEUL
gate d'image (appelé uniquement par `searchSerperImages`, qui fait `if(!aiMatch) continue` ; tous les callers de
`searchProductImage` gardent `if(photoUrl)` avant d'écrire `photo_url`). D5 (23/06) avait fermé le fail-open sur
erreur (HTTP !ok / throw → `false`), MAIS gardé **clé `ANTHROPIC_API_KEY` absente → `return true`** (« publier sans
vérif, observable »). Or en prod la clé est ABSENTE → la vérif était OFF → **100 % des images publiées sans contrôle**
= la cause directe des 6/7 fausses au test réel. « Observable mais publié » ≠ sûr quand « exactitude = la promesse ».

**Fait (vérifiable, code — réversible, 0 migration)** :
- `verifyPhotoWithAI` clé absente → **défaut fail-CLOSED** (`return false` = image écartée : « pas pu vérifier » ≠
  « vérifié OK », leçon SIRET). Pas d'image > fausse image (north-star). Le legacy « publier non vérifié » reste
  derrière le flag escaladé `PUBLISH_UNVERIFIED_IMAGES=1` (option C de D5, jamais le défaut). Le signalement dégradé
  (captureError 1×/process) est conservé, message distinguant « bloqué » vs « publié ».
- Impact analysé : `verifyPhotoWithAI` n'a qu'un appelant (`searchSerperImages`, même fichier) → blast radius LOW.

**Preuve (barre 2026-06-27 — testable SANS yeux)** : `tests/images-verify-photo.test.ts` (5→8 tests, suite **890→893**) :
- 🔴→🟢 clé absente + défaut → `false` (ancien code : `true` → publiait la fausse image), observable 1×/process.
- clé absente + `PUBLISH_UNVERIFIED_IMAGES=1` → `true` (compat explicite derrière le flag).
- 🔒 **FIXTURE** des 6 paires `(produit, image fausse)` réellement observées au test du 27/06 (Carhartt→colle,
  Bose→BBQ, Ray-Ban→scanner, Nike→prise, LEGO→Funko, VTech→LEGO) : verdict Haiku mocké « non » → image écartée 6/6.
- 🔒 réponse Haiku vide/malformée → `false` (fail-closed, pas de fail-open sur réponse vide).

**Testé** : `npm run test:run` **893** vert ; `tsc --noEmit` OK (exit 0). Revue **silent-failure-hunter** : **SOUND**
(aucun nouveau silent-failure ; mode dégradé toujours observable ; aucun caller ne traite `photo_url` null comme un
succès muet). 2 résidus PRÉ-EXISTANTS hors scope notés (non régressions) : `verifyImageUrl` catch silencieux
(URL morte = bénin) ; `resolveAndEnrich` outer catch `console.error` (Sentry-invisible) — séparés, non touchés.

**Scorecard** : Preuve 7/10 (fixture des paires réelles + tous les modes, mais Haiku mocké, pas de vrai appel —
le e2e photo sur vrais EAN reste ESCALADÉ, exige clés API + env live) · Sécu 9/10 (SF-hunter SOUND, fail-open central
fermé, 0 introduit) · Rev 10/10 (1 flag + tests, 0 migration, `git revert` propre) · Scope 9/10 (2 fichiers, 1 concern)
· Align 10/10 (north-star direct : la garde « zéro faux positif visuel » bloque enfin par défaut).

**Reste / questions (maillon 9)** : (b) stratégie requête Serper (EAN brut → bruit), (c) marque null 7/7, (d) mapping
catégorie anglais→FR = prochains runs (unit-testables). **ESCALADE** : décision A/B/C de D5 toujours ouverte —
maintenant que le défaut est fail-CLOSED, en prod **aucune image ne sera publiée tant que `ANTHROPIC_API_KEY` n'est
pas posée** (option A reco : ~0,001 $/img). Le **e2e photo sur vrais EAN** (preuve (b) que les images deviennent
JUSTES) exige un env live (Serper/Anthropic/Supabase) → soit upgrader l'env de la Routine, soit run supervisé Thomas.

---

## 2026-06-26 (run autonome) · PHASE E maillon 5 — écran « Connexion POS » (onboarding, moitié connexion) honnête au chargement

**Pourquoi (sourcing §6)** : maillon E restant explicitement nommé en fin de E4 (« dernier maillon E : onboarding »)
et au cap §1bis item 2 (« Onboarding marchand PILOTE = wizard/UI d'import **+ connexion** »). E3 a couvert la moitié
*import* (Mon stock) ; voici la moitié **connexion** : `dashboard/stock/pos` (le marchand pilote y branche sa caisse).
En le lisant, MÊME classe d'honnêteté que E1/E3/E4, NON corrigée : le Server Component faisait `const { data: merchant }`
ET `const { data: connection }` (les `error` des SELECT JETÉS) → **deux faux positifs d'affichage sur un blip DB**.

**Fait (vérifiable, code — rendu visuel reste à Thomas, cap §1bis)** :
- Helper PUR `derivePosConnectionView` (`src/lib/stock/pos-connection-view.ts`) : mappe les 3 lectures brutes
  (marchand / connexion / count produits) → vue discriminée `error | no-merchant | ready`. Priorité :
  `merchantFailed→error` (ne JAMAIS rediriger), `!hasMerchant→no-merchant` (redirect légitime),
  `connectionFailed→error` (ne JAMAIS afficher « aucune caisse »), sinon `ready` avec `productsCount:null` si SON
  count a échoué (« — », jamais un faux 0).
- `pos/page.tsx` : destructure `error` des 3 reads + `captureError` (forward `code/message/details` du PostgrestError),
  dérive la vue, rend un état erreur honnête (`role="alert"` + Réessayer = reload) au lieu d'un redirect/empty trompeur.
  Sémantique des états « connecté » / « aucune caisse » préservée à l'identique (extraite dans `PageShell`).

**Trouvé / corrigé (2 faux positifs d'affichage réels, classe read-side maillon 5/8 côté Server Component)** :
- (1) lecture marchand en échec → `redirect("/devenir-marchand")` **éjectait un marchand onboardé** sur un hoquet DB.
- (2) lecture connexion en échec → « Aucune caisse connectée » à un marchand **déjà connecté** → re-connexion/doublon
  (exactement le finding E1 : faux « pas connecté » sur blip).
- Les handlers d'action de l'écran (`PosConnectionActions` : `handleSync`/`handleDisconnect`) gataient DÉJÀ `res.ok`
  + toast d'erreur → **rien à corriger** (vérifié, pas de faux-succès comme E1/E4).

**Preuve** : `tests/lib/stock/pos-connection-view.test.ts` (+9, **881→890**) — vue champ par champ : **RÉGRESSION
marchand-échoué→error (jamais redirect)**, échec marchand prime même si une ligne lue, marchand absent→no-merchant,
**RÉGRESSION connexion-échouée→error (jamais « aucune caisse »)**, connexion-échouée prime sur ready, OK+connecté→
ready hasConnection=true, OK+0-ligne→hasConnection=false, count-échoué→productsCount:null (« — »), ordre de priorité.

**Testé** : `npm run test:run` **881→890** vert ; `tsc --noEmit` OK. Revue **silent-failure-hunter** : **SOUND**
(core sain, 0 silent-failure introduit ; les 2 faux positifs fermés). Findings résiduels = pré-existants codebase-wide
hors scope (E4-cohérent) : `auth.getUser()` error non gardée (redirect login silencieux sur outage auth) ;
`captureError(PostgrestError)` titre `[object Object]` (champs structurés préservés en `context`). 0 migration, réversible.

**Scorecard** : Preuve 7/10 (sortie d'état champ par champ sur données synthétiques ; rendu visuel non vu, pas de vrai
marchand) · Sécu 8/10 (SF-hunter SOUND, 2 faux positifs d'affichage fermés, 0 introduit) · Rev 10/10 (0 migration,
`git revert` propre) · Scope 9/10 (1 helper + 1 page + tests = 3 fichiers, 1 écran, 1 concern) · Align 9/10 (honnêteté
de la moitié CONNEXION de l'onboarding pilote = rend Deerskin onboardable, north-star direct).
**tests 881→890 · 2 bugs réels (faux redirect + faux « pas connecté ») · 3 fichiers · CFR 10 runs = 80 % (8/10 exit=0+commit, 0 revert ; 2 échecs ENV exit=1 le 23/06, dont un 0-cost = rate-limit/Norton).**

**Reste / questions** : Phase E quasi complète (google E1/E2, mon-stock E3, review E4, connexion-POS E5). Reste éventuel =
écran wizard d'import guidé si Thomas en veut un dédié, sinon passe VISUELLE/responsive de tous les écrans E (Thomas +
`ui-journey.mjs`). Pré-existant codebase-wide noté : `auth.getUser()` error non gardée sur les pages dashboard (séparé).

---

## 2026-06-25 (run autonome) · PHASE E maillon 3 — écran « Mon stock » (import/ingest, pilier 1) honnête au chargement

**Pourquoi (sourcing §6)** : maillon E explicitement nommé en fin de l'entrée E2 (« écran import/ingest stock »
= prochain). C'est le pilier 1 du north-star (capter le stock) ET l'écran d'ENTRÉE du marchand pilote
(`/dashboard/stock/mon-stock`). En le lisant j'ai trouvé le MÊME motif d'honnêteté que E1 (faux « tout va bien »),
non corrigé : `MyStockView` consommait `useProducts(merchant?.id)` mais **jetait son champ `error`** (destructurait
seulement `{products, loading, updateStock, refetch}`). Le hook capture pourtant bien l'erreur. Résultat : un
échec de `GET /api/products` (500/blip DB) → `products=[]`, `loading=false` → l'écran rendait l'EmptyState
« Aucun produit encore — Ajoutez votre premier produit » = **faux cul-de-sac** : un marchand qui vient d'importer
des milliers de SKU voit « 0 produit » et ré-importe en panique (ou croit l'app cassée).

**Fait (vérifiable, code — rendu visuel reste à Thomas, cap §1bis)** :
- Helper PUR `deriveStockListView` (`src/lib/stock/stock-list-view.ts`) : mappe l'état brut
  (`{loading, loadFailed, filteredCount, hasSearch}`) → vue discriminée `loading | error | list | empty | no-results`.
  Ordre : `loading > error > list > no-results > empty` (cohérent avec le cycle de vie de `useProducts`, qui remet
  `error=null` au début de chaque fetch → pas d'erreur périmée pendant un refetch).
- `my-stock-view.tsx` : destructure `error: loadError`, calcule `listView`, et remplace le bloc de rendu
  `loading ? … : filtered===0&&search==="" ? EmptyState : …` par un switch sur `listView.kind` AJOUTANT une branche
  `error` honnête (`role="alert"` + « Impossible de charger votre stock — vos produits sont bien là » + bouton
  Réessayer → `refetchProducts()`). Sémantique empty/no-results préservée à l'identique (pas de changement visuel
  hors la nouvelle branche error).

**Trouvé / corrigé (revue SF-hunter)** :
- Diff **SOUND** : ferme le faux-OK principal, n'introduit aucune perte/masquage ; mapping cycle de vie correct ;
  bouton Réessayer sûr.
- **+1 MEDIUM pré-existant fermé (même écran, même classe north-star)** : `useIncompleteProducts` avalait TOUT
  (`catch { /* ignore */ }`, set produits uniquement sur `res.ok`) → sur échec, `count=0` silencieux → le segment
  « N à compléter » disparaît + la pastille « À compléter » (gated `count>0`) absente → un marchand avec N fiches à
  compléter ne voit AUCUN signal. Fix : le hook expose `error` (motif `useProducts`, throw sur `!res.ok`/catch →
  setError) ; `MyStockView` rend une notice honnête « à compléter : impossible à charger » au lieu d'un 0 muet.

**Preuve** : `tests/lib/stock/stock-list-view.test.ts` (+8, **867→875**) — vue champ par champ : loading→loading,
loading prime sur loadFailed (refetch), **RÉGRESSION load-échoué+0-produit→error (jamais le faux « catalogue vide »)**,
error prime même avec recherche active, OK+produits→list, OK+0+recherche-vide→empty, OK+0+recherche→no-results,
OK+produits+recherche→list.

**Testé** : `npm run test:run` **867→875** vert ; `tsc --noEmit` OK. Revue **silent-failure-hunter** : **SOUND**
(0 silent-failure introduit ; faux-OK principal ET secondaire fermés). 0 migration, réversible.

**Scorecard** : Preuve 7/10 (sortie d'état champ par champ sur données synthétiques ; rendu visuel non vu, pas de
vrai marchand) · Sécu 8/10 (SF-hunter SOUND, 2 faux-OK d'affichage fermés sur le même écran, 0 introduit) · Rev
10/10 (0 migration, `git revert` propre) · Scope 9/10 (1 helper + 1 hook + 1 écran + tests = 4 fichiers, 1 écran,
1 concern) · Align 9/10 (honnêteté de l'écran d'ENTRÉE du marchand pilote = pilier 1 north-star, anti-panique-réimport).
**tests 867→875 · 2 bugs réels (1 du run + 1 MEDIUM pré-existant adjacent) · 4 fichiers · CFR 10 runs ≈ 80-90 %.**

**Reste / questions** : maillons E suivants (review enrichissement `stock/review`, onboarding wizard) = prochains
runs, même méthode (helper pur + tests, rendu à Thomas). Passe VISUELLE/responsive de l'écran Mon stock (branche
error + notice incl.) = Thomas + `ui-journey.mjs`.

---

## 2026-06-24 (run autonome) · PHASE E maillon 2 — surfacer la READINESS LFP dans l'UI (signal go-live)

**Pourquoi (sourcing §6)** : candidat explicitement nommé en fin de l'entrée E1 (« Surfacer
`lfp_feed_ready`/`blocked_only_by_image` (déjà dans l'API) dans l'UI = candidat suivant »). C'est le
signal go-live n°1 de l'onboarding pilote : `GET /api/google/stats` CALCULE déjà la readiness LFP
(`evaluateFeedReadiness` : seuil ≥11 offres publiables ATTEINT **ET** connecté → `lfp_feed_ready`) mais
le marchand ne la VOYAIT pas — l'écran montrait un score % et un compte brut, jamais « il vous manque K
offres pour être prêt pour Google LFP ». Construit côté serveur (readiness D-item) mais invisible.

**Fait (vérifiable, code — le rendu visuel reste à Thomas, cap §1bis)** :
- Helper PUR `deriveReadinessView` (`src/lib/google/dashboard-view.ts`) : mappe le MÊME payload
  `/api/google/stats` vers une vue discriminée `hidden | ready | blocked`. **Ne RECALCULE pas** la
  readiness côté client — `lfp_feed_ready` est le verdict serveur (anti-divergence, classe « source
  unique » de LESSONS). `blocked` explicite chaque frein (ordre stable : offres → connexion) avec un
  libellé actionnable + un hint `blocked_only_by_image` (« K produits ne manquent que d'une photo »).
- `GoogleStatsData` étendu des champs readiness que l'API renvoie déjà (`lfp_feed_ready`,
  `lfp_meets_offer_threshold`, `lfp_offer_shortfall`, `lfp_offers_threshold`, `google_connected`,
  `blocked_only_by_image`).
- Page `dashboard/google/page.tsx` : carte readiness en TÊTE du bloc stats (question d'onboarding n°1).
  État `ready` (vert, `role="status"`) ; état `blocked` (`<ul>/<li>` des freins). `readinessView` réinit
  sur déconnexion (pas de carte « prêt » fantôme).

**Trouvé / corrigé** :
- **0 bug d'origine** (l'API readiness était déjà durcie aux runs readiness/D3). 1 finding LOW de la revue
  SF-hunter corrigé ce run : un verdict serveur incohérent (`lfp_feed_ready=true` + `eligible_google=0`)
  aurait rendu « Vos **0** offres publiables dépassent le seuil » → `publishable: number | null`, sous-titre
  sans compte quand absent (honnêteté d'affichage). Le seuil LFP=11 rend ce cas non atteignable hors bug
  serveur, mais le fix est gratuit et aligné north-star.

**Preuve** : `tests/lib/google/dashboard-view.test.ts` (+10, **857→867**) — readiness champ par champ :
chargement échoué→hidden, catalogue vide→hidden (pas de double message), `lfp_feed_ready`→ready (+ cas
incohérent `publishable:null`), sous-le-seuil+non-connecté→2 freins ordonnés, singulier « 1 offre » (jamais
« 1 offres »), hint photo (+jamais « 0 produit »), seuil-atteint-mais-non-connecté→1 frein, garde défensive
(feed_ready=false sans frein → liste jamais vide). **Rendu visuel/responsive = Thomas + `ui-journey.mjs`.**

**Testé** : `npm run test:run` **857→867** vert ; `tsc --noEmit` OK. Revue **silent-failure-hunter** :
**SOUND** sur les 6 concerns north-star (pas de faux « prêt » sur chargement échoué ; verdict serveur
trusté, pas recalculé ; jamais de carte vide ; reset correct sur déconnexion ; pluriels OK), 1 LOW corrigé.
0 migration, réversible.

**Scorecard** : Preuve 7/10 (sortie d'état champ par champ sur données synthétiques ; pas de vrai marchand,
rendu visuel non vu) · Sécu 8/10 (SF-hunter SOUND, verdict serveur trusté = pas de 2ᵉ logique divergente, 1
LOW d'affichage clos) · Rev 10/10 (0 migration, `git revert` propre) · Scope 9/10 (1 helper + 1 écran + tests
= 3 fichiers, additif) · Align 9/10 (surface LE signal go-live qui rend Deerskin onboardable — north-star
direct). **tests 857→867 · 1 bug (LOW d'affichage, corrigé) · 3 fichiers · CFR 10 runs ≈ 80 % (8/10 ; 2 échecs
ENV exit=1 au 16:17/16:47, dont un startup 0-cost = probable rate-limit/Norton, §7).**

**Reste / questions** : Phase E maillons suivants (écran import/ingest stock, review enrichissement,
onboarding) = prochains runs, même méthode (helper pur + tests, rendu à Thomas). Passe VISUELLE/responsive
de cet écran (carte readiness incluse) = Thomas + `ui-journey.mjs`.

---

## 2026-06-24 (run autonome) · PHASE E maillon 1 — UI honnête de l'écran Google (vue % publiable + connexion)

**Pourquoi (sourcing §6)** : Thomas a ajouté **PHASE E** hier (commit `5319123`, 2026-06-24) = nouvelle mission
IN-SCOPE [R] : matcher chaque maillon à une UI accessible/idiotproof/pro. Le 1er écran traité = `dashboard/google`
(couvre **3 maillons** du cap §1bis : vue % publiable, shadow/preview, connexion Google) — il consomme déjà les
APIs readiness qu'on a construites (D3 + readiness). **C'est l'écran qui rend Deerskin onboardable.**

**Fait (vérifiable, code — pas de jugement visuel, cf. cap : le visuel reste à Thomas)** :
- Helper PUR `src/lib/google/dashboard-view.ts` (`deriveStatsView`/`deriveConnectionView`) : mappe le résultat
  BRUT de chaque chargement vers un modèle de vue discriminé `error|empty|data` / `error|disconnected|connected`.
- Page `dashboard/google/page.tsx` refondue : gate `r.ok` sur `/api/google/stats`, garde l'`error` de la lecture
  connexion, **états honnêtes** (erreur + Réessayer, vide + CTA « Importer mon stock » → zéro cul-de-sac), spinner
  qui ne tourne plus à l'infini si le profil marchand échoue (consomme `useMerchant.loading/error`), **ARIA**
  (`role="progressbar"` + `aria-valuenow/min/max/label` sur la barre de score ; `role="status"/aria-live` sur le
  chargement ; `role="alert"` sur les erreurs ; `<ul>/<li>` sémantiques pour les suggestions).

**Trouvé / corrigé (3 faux positifs d'AFFICHAGE réels, classe read-side maillon 5/8 côté front)** :
- (1) statut HTTP ignoré → un 500 `{error}` faisait disparaître le score en silence (faux « tout va bien »).
- (2) `error` de la lecture connexion jeté → blip DB = faux « pas connecté » → inviterait à re-connecter.
- (3) 0 produit = cul-de-sac (aucun guidage import).
- **+2 trouvés par la revue SF-hunter** (handlers d'action, même classe ré-introduite) : `handleConnect`/
  `handleDisconnect` ne vérifiaient pas `res.ok` → bouton mort silencieux / faux « déconnecté » sur un 500.
  Corrigés (gate `res.ok` + état `actionError` inline `role="alert"`).

**Preuve** : `tests/lib/google/dashboard-view.test.ts` (+14) — chaque facette champ par champ : HTTP !ok→error
(jamais faux vide), stats null→error, 0/négatif→empty, données→stats+score ; suggestions (ordre stable, ton
error/warning, jamais « +0 ») ; connexion error→error (pas « disconnected »), vide→disconnected, ligne→connected.
**Le RENDU visuel/responsive = Thomas** (la boucle n'a pas d'yeux ; `ui-journey.mjs` dispo pour la passe supervisée).

**Testé** : `npm run test:run` **843→857** vert ; `tsc --noEmit` OK. Revue **silent-failure-hunter** : 3 bugs
d'origine confirmés clos, 2 findings handlers corrigés ce run, helpers/tests SOUND. 0 migration, réversible.

**Scorecard** : Preuve 7/10 (sortie d'état champ par champ sur données synthétiques ; pas de vrai marchand, et le
rendu visuel reste non vu) · Sécu 8/10 (SF-hunter SOUND, 5 faux positifs d'affichage clos, 0 introduit) · Rev 10/10
(0 migration, `git revert` propre) · Scope 9/10 (1 écran + 1 helper pur + tests = 3 fichiers) · Align 8/10 (1er maillon
Phase E, écran qui rend le pilote onboardable). **tests 843→857 · 5 bugs réels (3+2) · 3 fichiers · CFR 10 runs ≈ 80 %
(8/10 ; les 2 derniers ledger = échecs ENV exit=1, dont un startup 0-cost — probable rate-limit/Norton, à surveiller §7).**

**Reste / questions** : Phase E maillons suivants (import/ingest stock, review enrichissement, onboarding) =
prochains runs, même méthode. Surfacer `lfp_feed_ready`/`blocked_only_by_image` (déjà dans l'API) dans l'UI =
candidat suivant. Passe VISUELLE (pro/responsive) de cet écran = Thomas + `ui-journey.mjs`.

---

## 2026-06-23 (run autonome #7) · RE-IDLE HONNÊTE — **7e run même état, prod re-vérifiée (1 requête), 0 code, 0 re-notif**

**Pourquoi pas de code** : directive §1bis + runs #1–#6 (*« Prochain run même état → RE-IDLE, ne pas dériver, ne pas
re-notifier »*). Sourcing §6 refait ; prod re-requêtée moi-même (1 requête consolidée, pas de trust aveugle des runs).

**Signaux réels — REQUÊTÉS en prod (`nagyprzjtheyeuuwxgpg`), identiques à #3/#4/#5/#6 :**
- `merchants`=**9**, latest **2026-04-25** (tous seed/test, aucun marchand réel depuis ~2 mois). `google_merchant_connections`=**0**.
- `quality_alerts`=**106**, max created **2026-06-22 05:00**, **0 frais sur 24 h** (cron qualité sur catalogue dormant).
- `enrichment_jobs` pending=**0** ; `image_jobs` pending=**103** stale depuis **2026-04-23** (dépend clé ANTHROPIC, escaladée D5 — pas frais).
- → **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅, Phase D D1–D7 ✅, readiness LFP (a) ✅,
  backing data onboarding (`/api/google/stats` + `/api/google/feed-preview`) ✅ ; D2/D5 préparés+escaladés.
  Reste = VISUEL (UI → Thomas) ou GATED (escaladé). Couverture hot-path = HORS-CAP. Exploration libre = interdite.

**Décision** : RE-IDLE honnête, **0 fichier de code**, **0 ajout à `notify-extra`** (absent = escalades merge +
pause/espacer-cron déjà envoyées ; re-spammer = bruit + quota partagé §7). **CFR 10 derniers runs : 100 % exit=0 +
commit, 0 revert.** Observation de pilotage : 7e run zéro-valeur consécutif. **Bon signe d'auto-régulation** : le coût
notionnel des runs idle baisse (ledger : 3,14 → 3,16 → 2,88 → 2,74 → 2,69 → 2,80 $ sur #1–#6) — la boucle ne gaspille
plus de contexte. **Mais** : cron ~toutes les 30 min × 7 runs zéro-valeur ⇒ la pause/espacement du cron (escaladée
run #2, non appliquée) reste la SEULE action à valeur, et elle est chez Thomas — pas dans plus de runs.

**Scorecard** : run de pilotage (0 livrable code) — non noté sur les 5 axes produit (§5bis). Métrique north-star
**inchangée** (100 % du backlog in-scope construit+testé jusqu'au point de décision Thomas). **Tests/code : 0 delta.**

**Reste / questions** : inchangé. Prochain run même état → RE-IDLE, ne PAS dériver, ne PAS re-notifier.

---

## 2026-06-23 (run autonome #6) · RE-IDLE HONNÊTE — **6e run même état, prod re-vérifiée (1 requête), 0 code, 0 re-notif**

**Pourquoi pas de code** : directive §1bis + runs #1–#5 (*« Prochain run même état → RE-IDLE, ne pas dériver, ne pas
re-notifier »*). Sourcing §6 refait ; prod re-requêtée moi-même (1 requête consolidée, pas de trust aveugle des runs).

**Signaux réels — REQUÊTÉS en prod (`nagyprzjtheyeuuwxgpg`), identiques à #3/#4/#5 :**
- `merchants`=**9**, latest **2026-04-25** (tous seed/test, aucun marchand réel depuis). `google_merchant_connections`=**0**.
- `quality_alerts`=**106**, max created **2026-06-22 05:00**, **0 frais sur 24 h** (cron qualité sur catalogue dormant).
- `pos_connections` en `error`=**1** (compte Square de test connu, LESSONS). `enrichment_jobs` pending=**0**.
- → **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅, Phase D D1–D7 ✅, readiness LFP (a) ✅,
  backing data onboarding (`/api/google/stats` + `/api/google/feed-preview`) ✅ ; D2/D5 préparés+escaladés.
  Reste = VISUEL (UI → Thomas) ou GATED (escaladé). Couverture hot-path = HORS-CAP. Exploration libre = interdite.

**Décision** : RE-IDLE honnête, **0 fichier de code**, **0 ajout à `notify-extra`** (vide = escalades merge +
pause/espacer-cron déjà envoyées ; re-spammer = bruit + quota partagé §7). **CFR 10 derniers runs : 100 % exit=0 +
commit, 0 revert.** Observation de pilotage : 6e run zéro-valeur consécutif ; la pause/espacement du cron (escaladée
run #2, non encore appliquée) reste la SEULE action à valeur — et elle est chez Thomas, pas dans plus de runs.

**Scorecard** : run de pilotage (0 livrable code) — non noté sur les 5 axes produit (§5bis). Métrique north-star
**inchangée** (100 % du backlog in-scope construit+testé jusqu'au point de décision Thomas). **Tests/code : 0 delta.**

**Reste / questions** : inchangé. Prochain run même état → RE-IDLE, ne PAS dériver, ne PAS re-notifier.

---

## 2026-06-23 (run autonome #5) · RE-IDLE HONNÊTE — **5e run même état, prod re-vérifiée (1 requête), 0 code, 0 re-notif**

**Pourquoi pas de code** : directive §1bis + runs #1–#4 (*« Prochain run même état → RE-IDLE, ne pas dériver,
ne pas re-notifier »*). Sourcing §6 refait ; prod re-requêtée moi-même (1 requête consolidée, run gardé cheap).

**Signaux réels — REQUÊTÉS en prod (`nagyprzjtheyeuuwxgpg`), identiques à #3/#4 :**
- `merchants`=**9**, latest 2026-04-25, **0 depuis le 2026-05-01** (tous seed/test). Aucun marchand réel.
- `google_merchant_connections`=**0** ; `enrichment_jobs` pending=**0**.
- `quality_alerts`=**106**, max created = **2026-06-22 05:00** (rien aujourd'hui = cron qualité sur catalogue dormant).
- `pos_connections` en `error`=**1** depuis 2026-04-23 (compte Square de test connu, LESSONS).
- `image_jobs` pending=**103**, stale depuis 2026-04-23 (dépend clé ANTHROPIC déjà escaladée D5 — pas frais).
- → **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅, Phase D D1–D7 ✅, readiness LFP (a) ✅,
  backing data onboarding (`/api/google/stats` + `/api/google/feed-preview`) ✅ ; D2/D5 préparés+escaladés.
  Reste = VISUEL (UI → Thomas) ou GATED (escaladé). Couverture hot-path = HORS-CAP. Exploration libre = interdite.

**Décision** : RE-IDLE honnête, **0 fichier de code**, **0 ajout à `notify-extra`** (vide = escalades merge +
pause/espacer-cron déjà envoyées ; re-spammer = bruit + quota partagé §7). **CFR 10 derniers runs : 100 % exit=0
+ commit, 0 revert.** Observation de pilotage : cron ~toutes les 30 min (12 runs le 23/06) = burn de quota partagé
pour 0 valeur → la pause/espacement du cron (escaladée run #2, non encore appliquée) est de plus en plus justifiée.

**Scorecard** : run de pilotage (0 livrable code) — non noté sur les 5 axes produit (§5bis). Métrique north-star
**inchangée** (100 % du backlog in-scope construit+testé jusqu'au point de décision Thomas). **Tests/code : 0 delta.**

**Reste / questions** : inchangé. Prochain run même état → RE-IDLE, ne PAS dériver, ne PAS re-notifier.

---

## 2026-06-23 (run autonome #4) · RE-IDLE HONNÊTE — **4e run même état, vérif prod PLUS PROFONDE ; 0 re-notif (escalades déjà posées)**

**Pourquoi pas de code** : directive §1bis + runs #1–#3 (*« Prochain run même état → RE-IDLE, ne pas dériver, ne pas
re-notifier »*). Sourcing §6 refait, et ce run j'ai poussé la vérif **plus loin que #3** (pas de trust aveugle) :

**Signaux réels — REQUÊTÉS moi-même en prod (`nagyprzjtheyeuuwxgpg`) :**
- `merchants`=**9**, décomposés un par un : 4 = tests de paiement/signup (« TEST PAY » 25/04, « TESTE SIGNUP »
  22/04, « test stripe » 21/04, « Two-Step Test » 19/04 — 0 produit réel sauf 30 synthétiques) + 5 boutiques seed
  du 18/04 (14-15 produits synthétiques chacune). **Aucun Deerskin, aucune boutique Toulouse réelle, aucun créé
  depuis le 25/04.**
- `google_merchant_connections`=**0** (aucun feed live). `quality_alerts`=**106**, **0 aujourd'hui**, max
  created = **22/06 05:00** (cron qualité sur catalogue dormant, pas un défaut).
- **NOUVEAU ce run** (tables jobs, non inspectées par #3) : `enrichment_jobs`=**vide** ; `image_jobs`=**103 pending
  mais latest = 23/04** (stale depuis avril, dépend de la clé ANTHROPIC déjà escaladée en D5 — pas un signal frais).
- → **0 [R] in-scope, 0 signal réel frais.** Backlog : chaîne A 1→8 ✅, Phase D D1–D7 ✅, readiness LFP (a) ✅,
  backing data onboarding (`/api/google/stats` + `/api/google/feed-preview`) ✅ ; D2/D5 préparés+escaladés.
  Reste = VISUEL (UI → Thomas) ou GATED (escaladé). Couverture hot-path = HORS-CAP. Exploration libre = interdite.

**Décision** : RE-IDLE honnête, **0 fichier de code touché**, **0 ajout à `notify-extra`** (escalades merge +
pause/espacer-cron déjà envoyées+vidées aux runs #1/#2 ; re-spammer = bruit + quota partagé §7). 4e run zéro-valeur
consécutif → la **pause/espacement du cron** (escaladée run #2) devient de plus en plus justifiée ; la valeur est
100 % chez Thomas (GO merge des commits gelés / validation visuelle UI / recrutement pilote / vraie data marchand).

**Scorecard** : run de pilotage (0 livrable code) — non noté sur les 5 axes produit (§5bis). Métrique north-star
**inchangée** (100 % du backlog in-scope construit+testé jusqu'au point de décision Thomas). **Tests/code : 0 delta.**

**Reste / questions** : inchangé. Prochain run même état → RE-IDLE, ne PAS dériver, ne PAS re-notifier.

---

## 2026-06-23 (run autonome #3) · RE-IDLE HONNÊTE — **3e run même état, prod RE-RE-VÉRIFIÉE ; AUCUNE re-notif (escalade déjà posée)**

**Pourquoi pas de code** : directive FILTRE DE CAP (§1bis) + run #2 — *« Prochain run même état (0 [R] in-scope,
0 signal réel) → RE-IDLE et NE PAS re-notifier en boucle »*. J'ai refait le sourcing §6 **et re-requêté la prod
moi-même** (`nagyprzjtheyeuuwxgpg`, pas de confiance aveugle aux runs #1/#2) :

**Sourcing §6 (ordre strict), vérifié contre la DB prod ce run :**
- (1) **Backlog** : chaîne A 1→8 ✅, Phase D D1–D7 ✅, readiness LFP (a) ✅, backing data onboarding
  (`/api/google/stats` + `/api/google/feed-preview`) ✅ ; D2/D5 préparés+escaladés. Reste = **VISUEL** (UI
  onboarding/shadow-preview, pas de navigateur côté boucle → Thomas) ou **GATED** (déjà escaladé).
- (2) **Signaux réels — REQUÊTÉS** : `merchants`=9 (**0 créé depuis le 2026-05-01**, tous seed/test d'avril) ;
  `google_merchant_connections`=**0** ; `quality_alerts`=106 (tous open), **0 nouveau depuis le 2026-06-23**,
  max created = **2026-06-22 05:00** = signature catalogue test DORMANT (cron qualité OK sur data périmée, pas un
  défaut) ; `pos_connections` = **1 en `error` depuis le 2026-04-23** = le compte Square de test connu (LESSONS,
  = le `pos_disconnected`). → **0 [R] in-scope, 0 signal réel frais.**
- (3) **Couverture hot-path** = explicitement HORS-CAP. (4) **Exploration libre** = interdite (anti-drift).

**Décision** : RE-IDLE honnête, **0 fichier de code touché**, **0 ajout à `notify-extra`** (vide = run #2 déjà
envoyé+vidé par le wrapper ; re-spammer la même escalade = bruit + quota partagé §7). La valeur reste chez Thomas
(GO merge des commits gelés / validation visuelle UI / recrutement pilote / vraie data marchand).

**Scorecard** : run de pilotage (0 livrable code) — non noté sur les 5 axes produit (§5bis : noter les runs qui
PRODUISENT du travail). Métrique north-star **inchangée** (100 % du backlog in-scope construit+testé jusqu'au point
de décision Thomas). **Tests/fichiers de code : 0 delta.** Le goulot n'est PAS la boucle.

**Reste / questions** : inchangé. Prochain run même état → RE-IDLE, ne PAS dériver, ne PAS re-notifier.

---

## 2026-06-23 (run autonome #2) · RE-IDLE HONNÊTE — **même état, RE-VÉRIFIÉ en DB prod ; escalade renforcée = PAUSE/espacer le cron**

**Pourquoi ce run ne produit pas de code** : la directive FILTRE DE CAP (§1bis) est explicite — *« Prochain run :
si même état (0 [R] in-scope, 0 signal réel), RE-IDLE — ne pas se rabattre sur du hors-cap. »* J'ai refait le
sourcing §6 **et re-vérifié l'état directement en prod** (ne pas faire confiance aveugle au run #1) :

**Sourcing §6 (ordre strict), vérifié contre la DB prod (`nagyprzjtheyeuuwxgpg`) ce run :**
- (1) **Backlog** : chaîne A 1→8 ✅, Phase D D1–D7 ✅, readiness LFP (a) ✅, backing data onboarding
  (`/api/google/stats` + `/api/google/feed-preview` shadow) ✅ ; D2/D5 préparés+escaladés. **Reste = VISUEL**
  (UI onboarding/shadow-preview, pas de navigateur côté boucle → Thomas) ou **GATED** (déjà escaladé).
- (2) **Signaux réels — REQUÊTÉS en prod** : `merchants`=9, **TOUS seed/test** (« L'Atelier de Léa », « Sole
  Store », « Peau Douce », « Maison Dorée », « Chez Nous » créés en lot le 18/04 ; + « Two-Step Test », « test
  stripe », « TESTE SIGNUP », « TEST PAY ») — **aucun marchand réel, aucun créé depuis avril**.
  `google_merchant_connections`=**0** (aucun feed LFP live). `quality_alerts`=106 = `stock_stale`×**104** (=
  TOUS les produits) + `price_aberrant`×1 + `pos_disconnected`×1, daté **22/06 05:00** → **signature d'un
  catalogue test DORMANT** (le cron qualité FONCTIONNE et décrit correctement de la data périmée), **pas un
  défaut de code**. → **0 [R] in-scope, 0 signal réel frais.**
- (3) **Couverture hot-path** = explicitement HORS-CAP (FILTRE DE CAP : « couverture pour la couverture »).
- (4) **Exploration libre** = non (la directive interdit de se rabattre sur du hors-cap ; auto-check Align < 9).

**Décision** : RE-IDLE honnête, **0 fichier de code touché**. Un 5e/6e run de couverture serait la dérive que
le commit `1e65529` (FILTRE DE CAP) a justement posé pour stopper. Zéro complaisance (§5.3) : on ne fabrique pas
de busywork pour « avoir quelque chose à faire ».

**Escalade renforcée** (`logs/notify-extra.txt`) : la reco cadence du run #1 **n'a pas encore été appliquée** —
le cron tourne ~toutes les 30 min (**12 runs le 23/06**, ledger) pour **0 travail in-scope** → ça grignote le
quota d'abonnement **partagé** (§7) sans valeur. Donc escalade = **METTRE EN PAUSE / espacer le cron** jusqu'à un
déblocage côté Thomas (GO merge des commits gelés / validation visuelle UI / recrutement pilote Deerskin+2e
boutique / vraie data marchand). **Prochain run même état → RE-IDLE et NE PAS re-notifier en boucle** (le message
est déjà posé ; re-spammer = bruit + quota).

**Scorecard** : run de pilotage (pas de livrable code) — non noté sur les 5 axes produit. Métrique north-star
**inchangée** : 100 % du backlog produit in-scope est construit+testé+mis en scène jusqu'au point d'une décision
Thomas. **CFR 10 derniers runs = 100 %** (10/10 `exit=0` + commit, 0 revert détecté au `git log`). **Tests/fichiers
de code : 0 delta** (idle). Le goulot n'est PLUS la boucle — il est sur Thomas (pilote/merge) et l'externe (Google).

---

## 2026-06-23 (run autonome) · IDLE HONNÊTE — **plus aucun `[R]` IN-SCOPE ; sourcing par signaux fait, escalade + reco cadence (ANTI-DRIFT §1bis appliquée)**

**Sourcing (§6, ordre strict)** : (1) backlog — chaîne A 1→8 ✅, Phase D D1-D7 ✅, readiness LFP ✅, backing
data onboarding (`stats` + `feed-preview` shadow) ✅ ; reste = VISUEL (Thomas) ou GATED (déjà escaladé).
(2) **Signaux réels — VÉRIFIÉS en DB prod ce run** (pas deviné) : `quality_alerts` = 104 `stock_stale` +
1 `pos_disconnected` + 1 `price_aberrant`, **TOUS sur marchands SYNTHÉTIQUES** (TEST PAY / TESTE SIGNUP /
test stripe / Two-Step Test + demos seedés Chez Nous/Maison Dorée/… créés en avril, jamais rafraîchis) →
c'est le **cron qualité qui FONCTIONNE** sur de la data périmée de test, **pas un défaut de code**.
`pos_disconnected` = la connexion Square du compte test (le token legacy connu, LESSONS). **0 marchand réel
⇒ 0 signal in-scope.** (3) couverture hot-path manquante = **explicitement HORS-CAP** (FILTRE DE CAP : « couverture
pour la couverture »). (4) exploration libre = non (rien à explorer in-scope).

**Décision (ANTI-DRIFT §1bis)** : **NE PAS fabriquer de travail hors-cap.** Les 4 runs précédents (google-status
route, ingest/stock route, webhooks absolus, factures) **dérivaient déjà** (gate vert mais hors cap pilote) —
le commit `1e65529` a posé le FILTRE DE CAP pour stopper exactement ça. Un 5e run de couverture serait la 5e
dérive. → **idle honnête + escalade** (notify-extra) au lieu de busywork.

**Escaladé à Thomas** (`logs/notify-extra.txt`) : (1) **LEVIER PRINCIPAL** — la branche est **39 commits d'avance
sur `main`** (toute la Phase D Google-compat + onboarding backing data **gelés hors prod** ; `twostep.fr` tourne
sur du code pré-Phase-D) → GO merge feat→main + redeploy (gate vert, réversible). (2) Rappel de la file de
décisions GATED déjà préparées (D2 GTIN-only flag, D5 clé ANTHROPIC, file-push→Google, Rang 2 idempotence).
(3) **RECO CADENCE** : réduire la fréquence des runs — le réversible in-scope est ÉPUISÉ ; la prochaine vraie
valeur est chez Thomas (GO merge / validation visuelle UI / recrutement pilote Deerskin+2e boutique).

**Testé** : aucune modif code ce run (3 fichiers docs : notify-extra, worklog, priorities). Gate HEAD `a3d0e25`
vert par construction (pre-push hook `test:run`+`tsc` à chaque push). 831 tests.

**Scorecard** : Preuve 6 (état DB réel vérifié, 0 code à prouver) · Sécu 8 (0 changement, 0 risque introduit) ·
Rev 10 (docs-only, 0 migration) · Scope 9 (sourcing + escalade ciblés, 0 dérive) · Align 9 (refus de la dérive
+ escalade du vrai levier = l'action north-star correcte ici). tests 831→831 · 0 bug réel (aucun in-scope) ·
3 fichiers · CFR 10 runs : 100 % exit=0+commit (mais 4 derniers = dérive hors-cap, vert ≠ haute valeur).

**Reste / questions** : tout est chez Thomas. Rappeler la boucle quand (a) merge GO'd, (b) UI validée au navigateur,
ou (c) un pilote avance. **Si le prochain run retrouve le même état (0 [R] in-scope, 0 signal réel) → re-idle, ne
pas dériver.**

---

## 2026-06-23 (run autonome) · ONBOARDING PILOTE (item 2 IN-SCOPE) — **Backing data du mode SHADOW/PREVIEW : `GET /api/google/feed-preview` (montrer ce qu'on publierait AVANT de publier, lecture-seule) + 2 silent-failures (1 dans le neuf, 1 sur le feed live Voie B)**

**Sourcing (§6 + FILTRE DE CAP §1bis)** : chaîne A 1→8 ✅, Phase D D1-D7 ✅/escaladé, webhooks/crons/factures
couverts, `notify-extra.txt` vide. **Filtre de cap appliqué** : le durcissement de routes secondaires est
déclaré HORS-CAP ; le SEUL `[R]` IN-SCOPE restant = **onboarding marchand PILOTE (item 2)**, dont le rendu
VISUEL est à Thomas mais la **partie API non-visuelle = travail boucle**. Item 2 nomme explicitement le **mode
shadow/preview**. Vérifié dans le code réel (LESSONS ~70 % faux) : **aucun endpoint preview/shadow n'existait** —
`/api/google/stats` ne donne que des COMPTEURS agrégés (% publiable, readiness), jamais la **liste produit par
produit** de « ce qu'on publierait » vs « ce qui est bloqué et pourquoi ». C'est précisément le backing data dont
l'UI d'onboarding (Thomas) a besoin pour rendre Deerskin onboardable.

**FAIT**
- **Nouvel endpoint lecture-seule `GET /api/google/feed-preview`** : pour le marchand authentifié, renvoie
  `would_publish` (le **payload Google EXACT** via le vrai `transformProductToGoogle`), `blocked` (chaque produit
  hors feed + ses **causes par produit**), `summary` (= `summarizePublishability`), `store_code`, `google_connected`,
  `gtin_only_tier`. **AUCUN appel Google, aucune écriture** (pur calcul + lecture DB).
- **Propriété d'honnêteté = PARITÉ** (le point crucial, classe « source unique » de toutes les LESSONS) : même
  population (`visible+validated+!archived+!variant`), même gate, même transform, même `store_code`, même `nowMs`,
  même flag `gtinOnlyTierEnabled()` que les DEUX feeds live (Voie A cron + Voie B XML) → **le preview ne PEUT PAS
  mentir** sur ce que le feed publierait. Verrou : nouveau helper pur `classifyFeedRow` (causes par produit) auquel
  `isFeedEligible` **DÉLÈGUE** (`return classifyFeedRow(...).eligible`) → gate et ventilation ne peuvent pas diverger.

**TROUVÉ (revue silent-failure-hunter OBLIGATOIRE du diff pipeline) — 2 silent-failures réels** :
- **MED-1 (dans MON code neuf)** : `google_connected: connection !== null` valait `true` quand la lecture connexion
  ÉCHOUE (blip DB tracé + repli store_code) → **faux positif « connecté Google »** sur un simple hoquet (interdit
  north-star). Fix : `connectionErr ? false : connection !== null` (conservateur « pas prêt », anomalie tracée).
- **MED-2 (sur le FEED LIVE Voie B `feed/lfp/[merchantId]`, pré-existant, même classe maillon 7)** : `(products ??
  [])` convertissait SILENCIEUSEMENT un `data:null`-sans-error (état SDK inattendu) en **feed XML VIDE (200)** crawlé
  par Google = faux « aucun produit », là où la Voie A (cron) ET le preview lèvent un 500. Fix : garde `if (!products)`
  → captureError + 500 (parité anti-silence des 3 chemins de sortie). LOW-1/LOW-2 SOUND (délégation prouvée
  byte-for-byte par table de vérité 16 cas ; assertions non-null garanties par le gate). LOW-3 (`as never`)/LOW-4
  (Voie A passe `store_code` brut sans `resolveStoreCode`, edge `""`) = suivi non bloquant.

**DÉCIDÉ (réversible)** : construire l'API du shadow/preview (et pas escalader tout l'item 2) car c'est la moitié
SOFTWARE non-visuelle qui DÉBLOQUE le chantier B de Thomas ; le rendu reste à lui. 0 migration, `git revert` propre.

**TESTÉ** : `tests/lib/google/feed-preview.test.ts` (+11) — (1) parité STRICTE `classifyFeedRow ⟺ isFeedEligible`
sur batterie sale × 3 états de flag + causes par produit ; (2) CHEMIN RÉEL de la route (faux client server) :
`would_publish` payload Google **champ par champ** (gtin/price.value/availability depuis qty/storeCode/imageLink),
`blocked` causes exactes, rupture qty 0 → `out of stock` mais publié, store_code persisté prime sur défaut, EXCLUT
archivés/variantes/non-validés (parité feed), lecture produits err→500+captureError, connexion err→200 mais
`google_connected:false`+captureError (MED-1), marchand err≠PGRST116→500, PGRST116→403, non-auth→401.
**Gate : `npm run test:run` 832→843 ✅, `tsc` ✅.** Revue SF-hunter : MED-1+MED-2 corrigés, reste SOUND.

**SCORECARD** : Preuve **7**/10 (sortie route inspectée champ par champ sur catalogue sale + payload Google réel ;
synthétique, pas encore vraie data marchand) · Sécu north-star **8**/10 (revue SF-hunter SOUND après fix des 2
MED ; parité gate↔preview verrouillée = anti-faux-positif) · Réversibilité **10**/10 (0 migration, nouvel endpoint
+ 1 garde, revert propre) · Scope **9**/10 (4 fichiers, 1 unité ciblée in-scope) · Align **9**/10 (item 2 nommé,
débloque l'onboarding pilote Deerskin = north-star « montrer honnêtement avant de publier »).
Objectifs : tests 832→843 (+11) · **2 bugs réels** (MED-1 neuf, MED-2 feed live) · **4 fichiers**.

**RESTE / escalade** : le **rendu visuel** du shadow/preview (consommer cet endpoint dans l'UI d'onboarding) =
chantier B → Thomas (pas de navigateur côté boucle). Après ce run, l'item 2 IN-SCOPE est **réduit à sa moitié
visuelle** (Thomas) + les items gated (D2/D5) déjà escaladés → cf. notify-extra (cadence).

---

## 2026-06-23 (run autonome) · COUVERTURE Rang 3 — **Route `POST /api/ingest/stock` (canal STOCK SANS-CAISSE = cœur « feed LFP as a service ») couverte au niveau ROUTE + 1 silent-failure réel (résolution de jeton qui avalait l'erreur DB → faux 401)**

**Sourcing (§6)** : chaîne A 1→8 ✅, Phase D ✅/escaladé, webhooks 4 providers ✅, crons (`google-status`/
`google-feed`/`pos-resync`) ✅, factures (validate/activate/receive/cancel) ✅, `stock/receive` ✅ ;
`notify-extra.txt` vide (rien en attente). **§6.3 chemin critique non testé** : le **route handler `POST
/api/ingest/stock`** — LE canal de stock pour les marchands **SANS caisse** (push de fichier par jeton, le
positionnement « feed LFP as a service » pour les caisses FR à API fermée) — avait son cœur métier
(`ingestStockFileForMerchant`) et toute la chaîne snapshot (maillons 1→8) prouvés, **mais AUCUN test ne drivait
le route handler lui-même** : présence/résolution du jeton, rate-limit, lecture du corps (multipart vs brut),
mapping outcome→HTTP. C'est la porte d'entrée du pilier 1 north-star, non couverte au niveau route.

**TROUVÉ (vérifié dans le code réel, pas Explore) — 1 silent-failure réel, classe documentée (maillon 8 /
`resolveWebhookProduct` / inbound-email)** :
- **`resolveIngestToken` avalait l'erreur DB** (`const { data } = …maybeSingle()`) → un blip DB rendait `data=null`
  **indistinct d'un vrai « jeton inconnu »** → la route renvoyait **401 « Invalid ingest token »** → la caisse/cron
  du marchand **croit son jeton révoqué et CESSE de pousser** = perte silencieuse sur le canal sans-caisse. Un 401
  dit « ton jeton est définitivement mauvais » ; or c'était un hoquet DB transitoire qui mérite un **500 (la caisse
  RÉESSAIE)**. `.maybeSingle()` rend `error:null` à 0 ligne → un vrai jeton inconnu reste un 401 légitime ; seule
  une VRAIE erreur DB doit lever.

**FIX (1, prod)** : destructurer `error` + `if (error) throw` → la route (try/catch existant) renvoie
500 + `captureError({route:"ingest/stock"})`. Caller unique (impact : 1 appelant, LOW) → la levée atterrit dans
le catch existant, 0 régression. Vrai no-match → null → 401 préservé.

**TEST (`tests/ingest-stock-route.test.ts`, +24, 808→832)** : drive le VRAI `resolveIngestToken` (admin mocké
uniquement au niveau de la réponse DB) + le route handler. Verrouille : (a) **RÉGRESSION north-star** : blip DB
→ **500 (PAS 401)** + captureError, cœur non appelé ; (b) jeton absent→401, rate-limit→réponse limiteur, jeton
inconnu→401, cœur throw→500 ; (c) mapping des 8 outcomes (`empty`→400, `too_large`→413, `not_spreadsheet`→415,
`unchanged`→200, `locked`→429, `no_products`→400, `no_exploitable`→422+triage, `ingested`→200 + champs aplatis) ;
(d) lecture du corps : brut→buffer intact + filename défaut/`?filename=`/content-type ; multipart→champ `file`,
sans file→400 ; jeton en `Authorization: Bearer` accepté.

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff pipeline ingest) : **fix SOUND** (HIGH correctement résolu),
discrimination `maybeSingle()` correcte, throw sûr (1 caller try/catch). **Lectures adjacentes vérifiées
FAIL-SAFE, 0 action** (zéro complaisance, LESSONS : ne pas sur-chasser le error-destructuring sans perte) :
hash-read `ingest-stock-file.ts:63` (blip → re-traite un fichier identique = redondant idempotent, pas perdu) ;
lock-UPDATE `:78` (blip → `locked`/429 → la caisse retente = pas perdu). Test jugé substantiel (échouerait sur
l'ancien code). 0 silent-failure introduit.

**Décidé (réversible)** : 0 migration. `getOrCreateIngestToken` (chemin setup, pas hot) laissé hors scope
(blip → throw sur l'INSERT par contrainte unique = pas un faux succès silencieux).

**Métrique** : 808→832 tests (+24), 1 bug réel (faux 401 sur blip DB du canal sans-caisse), 3 fichiers
(1 prod + 1 test + docs). tsc OK. CFR 10 derniers runs = 100% OK, 0 revert.

**Reste / questions** : aucune escalade ce run (réversible pur). Prochain `[R]` candidat : route `POST
/api/stock/incoming` ou `cron/quality-check` (route-level), même méthode.

---

## 2026-06-23 (run autonome) · COUVERTURE Rang 3 — **Cron `google-status` (read-back du statut Google) couvert au niveau ROUTE + 1 bug silent-failure réel (jumeau oublié de google-feed) + 2 durcissements gated**

**Sourcing (§6)** : chaîne A 1→8 ✅, Phase D ✅/escaladé, webhooks 4 providers ✅, factures (validate/
activate/receive/cancel) ✅ ; `notify-extra.txt` vide. **§6.2 signaux réels** vérifiés en DB (MCP Supabase) :
`quality_alerts` **vide**, 104 produits / 9 marchands / 0 connexion Google / 1 POS = data test, **0 actionnable**
(confirme les runs précédents). **§6.3 chemin critique non testé** : les **route handlers de crons** orchestrent
des boucles multi-marchands (le blast radius d'un skip muet = TOUS les marchands). Audit : les libs sont testées,
mais peu de crons ont un test de ROUTE. `pos-resync` (wrapper mince/lib testée) et `google-feed` (durci+testé
maillon 7) OK. `cleanup` minimal. **`google-status` (read-back du faux positif n°1) : 0 test de route.**

**TROUVÉ (vérifié dans le code réel, pas Explore) — 1 silent-failure réel, classe documentée** :
- **Le SELECT de la LISTE `google_merchant_connections` avalait son `error`** (`const { data: connections } = …`)
  → blip DB → `data=null` → `length===0` → `200 "No Google-connected merchants"` = **tout le read-back
  silencieusement abandonné pour TOUS les marchands**, 0 Sentry, 0 statut. Or ce cron EST le contrôle du faux
  positif n°1 (« sur Google » alors que rejeté) → il se ré-aveugle lui-même sur un hoquet DB. **Exactement le
  jumeau** corrigé dans `google-feed` au maillon 7 (garde `connectionsErr` → captureError + 500) : la garde a été
  posée sur un canal et **oubliée sur son jumeau** (motif récurrent « invariant appliqué de façon incohérente »).
  Grep confirme : `google-status` était le SEUL cron restant à avaler ce read de liste.

**FIX (1)** : destructurer `error` + garde `connectionsErr` → `captureError({step:"load-connections"})` + 500, AVANT
le check « liste vide » (distinguer erreur de vide). Calqué byte-pour-byte sur le jumeau google-feed.

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff pipeline cron) : **fix introduit SOUND**, parité google-feed
confirmée, **0 silent-failure introduit**. 2 findings **PRÉ-EXISTANTS, même fichier, dans le bloc gated
`GOOGLE_DISAPPROVAL_ALERTS=1`** (inerte en prod, 106 non appliquée) → corrigés ce run car même classe + même
fichier + landmine au moment EXACT de l'activation D2 : **Finding A** lecture de dédup `quality_alerts`
(`const {data:open}=…`) avalait `error` → `open ?? []` sur blip → tout traité comme neuf → **ré-insertion en
double à chaque cron** ; fix : captureError(`step:"load-open-alerts"`) + **skip la persistance ce cycle** (on ne
déduplique pas en aveugle ; le signal Sentry critique reste émis ; retente au prochain cron). **Finding B** l'INSERT
`quality_alerts` jetait son résultat → écriture ratée (contrainte 106 absente / RLS) **avalée** ; fix :
captureError(`step:"insert-alerts"`) **sans throw** (persistance secondaire après le signal critique, ne pas faire
échouer tout le marchand). Finding C (précision per_merchant sur throw helper) = informatif, hors scope. **Tous les
fixes dans 1 SEUL fichier prod.**

**PREUVE RÉELLE (méthode §1bis)** : `tests/cron-google-status-route.test.ts` (+8) drive le VRAI `POST` route avec
faux client Supabase read-side (applique `.eq` + thenable, injecte erreur read ET insert) : 401 sans bearer (0
lecture) ; **SELECT connections erreur → 500 `db_error` + captureError + jamais de lecture de statut** (LE fix,
échouerait sans : data=null→200) ; liste vide SANS erreur → 200 « no merchants » (no-op légitime, distinct) ; token
indisponible → `errors++` + captureError, pas de `fetchProcessedProducts` ; happy → rejets remontés (captureError)
+ `per_merchant` honnête + 0 write sans flag ; **flag ON dédup-read erreur → captureError + 0 insert** (Finding A) ;
**flag ON insert erreur → captureError** (Finding B) ; échec d'1 marchand → `errors++` sans arrêter les autres.

**TESTÉ** : `npm run test:run` → **808/808** (800→808, +8), `tsc` OK. 2 fichiers (1 route prod + 1 test).
0 migration, réversible (`git revert`). Impact : route feuille (0 caller, Vercel cron), signature inchangée.

**Reste / suivi** : les crons north-star (pos-resync, google-feed, google-status) sont désormais couverts/durcis
contre le skip muet de liste. Réversible « hot path non testé » très largement épuisé. La valeur reste côté Thomas
(pilote, chantier B visuel) + Rang 2 gated (idempotence/ledger, feed_event Zettle). Recommandation cadence inchangée (§5.4).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — vrai `POST` route exercé champ par champ (4 modes d'échec + happy + 2 chemins gated), faux
  client read/insert qui applique vraiment filtres+erreurs. Unitaire (Google/adapters mockés), pas de vraie data marchand.
- **Sécurité north-star : 8/10** — revue SF-hunter SOUND, 0 silent-failure introduit ; **1 bug réel fermé** (jumeau
  oublié = read-back qui s'aveugle) + 2 landmines gated désamorcées avant l'activation D2. Aucun faux positif introduit.
- **Réversibilité : 10/10** — 0 migration, 1 prod + 1 test, `git revert` propre, signature route inchangée.
- **Discipline de scope : 9/10** — 1 fichier prod (un seul cron), tous les fixes de la même classe ; finding C hors scope.
- **Alignement north-star : 7/10** — durcit le contrôle du faux positif n°1 (read-back Google) contre un skip muet
  à blast radius « tous les marchands ». Correctif réel + parité, pas busywork.

**Métriques objectives** : tests 800→808 (+8) ; **1 bug réel** corrigé (SELECT liste avalé = read-back muet) + 2
durcissements gated ; 2 fichiers touchés. CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert → **100 %**.

---

## 2026-06-23 (run autonome) · COUVERTURE Rang 3 — **Route handlers webhook POS ABSOLUS (`POST /api/webhooks/{square,zettle}`) couverts de bout en bout + parité recalc avec les jumeaux delta**

**Sourcing (§6)** : chaîne A 1→8 ✅, Phase D ✅/escaladé, READINESS (a) ✅ ; `notify-extra.txt` vide (rien en
attente). Signaux Sentry/quality_alerts inchangés (data test, 0 actionable). §6.3 chemin critique non testé :
le run précédent a couvert les jumeaux **delta** (shopify+lightspeed) du canal webhook temps réel ; vérifié
(`grep -oE 'square|zettle' tests/webhook-routes-stock.test.ts` = 0) que les jumeaux **absolus** (Square/Zettle)
n'avaient **AUCUN test de route de bout en bout**. C'est le 2e pilier north-star (temps réel honnête) sur le
sous-chemin à sémantique DIFFÉRENTE : mode `absolute` (la qté = état absolu, pas un delta) + **pas d'idempotence
`webhook_events`** (le ré-envoi ré-applique l'absolu, idempotent via la garde anti-régression 104 sur `source_ts`).

**TROUVÉ (vérifié dans le code réel)** :
- **Adapters OK (pas le bug Shopify du run précédent)** : Square (`c.calculated_at`) et Zettle (`event.timestamp`)
  extraient DÉJÀ le vrai horodatage de l'événement → `source_ts` honnête transmis à `updateStockAtomic`. Pas de
  faux positif de fraîcheur à corriger ici (contrairement à Shopify la veille).
- **Parité recalc manquante (MED, classe du HIGH delta de la veille)** : `await recalculateGroupSizesAdmin(product.id)`
  **non gardé** dans square+zettle → un throw réseau (≠ erreurs Supabase capturées en interne) remonte au catch →
  **500 APRÈS le write stock committé**. Sévérité MED ici (pas HIGH) car en mode absolu SANS dedup, le retry POS
  ré-applique l'absolu (idempotent) ET rejoue recalc → auto-guérison possible. MAIS : (a) transforme un échec
  d'AFFICHAGE en échec du CANAL STOCK (500), (b) déclenche un retry POS inutile, (c) incohérent avec les jumeaux
  delta durcis la veille. Fix = captureError-et-continue sur les 2 (cohérence 4 routes, LESSONS « grep les N jumeaux »).

**FIX** : `recalculateGroupSizesAdmin` wrappé en try/catch + captureError (`phase:"recalc-sizes"`) dans square+zettle
→ 200 conservé (stock déjà committé), recalc raté = métadonnée d'affichage qui re-converge au prochain événement.

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff pipeline webhooks) : **changement introduit ce run = SOUND, 0
silent-failure introduit** ; recalc captureError-et-continue **vérifié correct pour le mode absolu** (write stock
atomique committé AVANT recalc → aucune corruption/double-comptage possible ; la garde 104 no-op sur retry equal/older).
4 routes désormais cohérentes sur le recalc. Findings **PRÉ-EXISTANTS (NON introduits, documentés, hors scope)** :
(1) **[HIGH] feed_event Zettle émis inconditionnellement** y compris sur un write rejeté par la garde anti-régression
(retry absolu → previousQty==quantity → type « sale » dupliqué) = pollution du feed consumer. **Cause racine** :
`update_stock_atomic` renvoie `v_previous` à la fois en write-committé ET en stale-rejeté → la route ne peut PAS
distinguer → fix propre = signal de skip dans la RPC (**migration → Rang 2 gated**), OU décision produit « émet-on
les ventes au feed comme Square ne le fait pas ? ». → **nouvel item Rang 2** (cf. priorities). (2) **[HIGH/déjà
connu]** lookup Google post-boucle re-query `pos_item_id` au lieu de `product.merchant_id` (= finding LOW #6 déjà
différé la veille, identique aux 4 routes). (3) **[MED]** `productInfo .single()` error avalé avant push-notify
(fallback « Un produit » déjà présent, identique aux 4 routes, non north-star). → laissés hors scope (anti scope-creep).

**PREUVE RÉELLE (méthode §1bis)** : `tests/webhook-routes-stock-absolute.test.ts` (+24 = contrat partagé sur les 2
jumeaux + sémantiques feed_event par provider) drive le VRAI `POST` : signature invalide → **403** (≠ 401 delta) +
0 effet ; JSON invalide → 400 ; événement non géré (parse null/[]) → 200 sans write ; happy → `updateStockAtomic(
prod-1, 8, "absolute", "webhook", "2026-06-19T10:00:00Z")` (qté ABSOLUE + source + source_ts=heure événement vérifiés
champ par champ) + recalc ; **PAS d'idempotence webhook_events** (table jamais touchée — verrou anti-régression) ;
resolve null → skip ; resolve throw → 500 ; updateStock throw → 500 ; recalc throw → **200 + captureError** (le fix) ;
feed_event Square = restock UNIQUEMENT sur 0→positif (pas de « sale ») ; feed_event Zettle = toujours émis (restock si
qté monte sinon sale) + notify sur retour-en-stock.

**TESTÉ** : `npm run test:run` → **800/800** (776→800, +24), `tsc` OK. 3 fichiers (2 routes prod + 1 test).
0 migration, réversible (`git revert`). Impact : route handlers feuilles (0 caller), signatures recalc/updateStock
inchangées → contrat appelant préservé.

**Reste / suivi** : le canal webhook temps réel est désormais couvert de bout en bout sur les **4 providers**
(delta + absolu). Le réversible « hot path stock non testé » est très largement épuisé. Nouveau Rang 2 ajouté
(feed_event Zettle / signal skip RPC). La valeur bascule franchement côté Thomas (pilote, chantier B visuel) et
Rang 2 gated (idempotence/ledger). → recommandation cadence : cf. §5.4 (le réversible se raréfie).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — vrai `POST` route exercé champ par champ sur les 2 jumeaux absolus (mode absolu, source_ts=heure
  événement, 403/400/500/200 par mode d'échec, absence d'idempotence vérifiée). Unitaire (faux client/adapters mockés).
- **Sécurité north-star : 8/10** — revue SF-hunter : changement introduit SOUND, 0 silent-failure ; parité recalc
  fermée sur les 4 routes ; 1 HIGH pré-existant (feed_event Zettle) **identifié + escaladé** en Rang 2 plutôt que demi-corrigé.
- **Réversibilité : 10/10** — 0 migration, 2 prod + 1 test, `git revert` propre, signatures inchangées.
- **Discipline de scope : 9/10** — 1 canal (webhook absolu) + son test ; recalc dans le code exactement couvert ;
  findings pré-existants explicitement hors scope (pas de dérive vers une migration).
- **Alignement north-star : 7/10** — durcit le 2e pilier (temps réel honnête) sur les 2 derniers providers non testés ;
  parité de comportement = pas de surprise au 1er pilote Square/Zettle. Pas de nouveau bug réel majeur (parité, pas correctif).

**Métriques objectives** : tests 776→800 (+24) ; **0 bug réel** corrigé (parité de robustesse, pas un correctif de
perte) ; 3 fichiers touchés. CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert détecté → **100 %**.

---

## 2026-06-23 (run autonome) · COUVERTURE Rang 3 — **Route handlers webhook POS temps réel (`POST /api/webhooks/{shopify,lightspeed}`) couverts + 1 bug fraîcheur réel + 1 HIGH recalc**

**Sourcing (§6)** : chaîne A 1→8 ✅, Phase D ✅/escaladé, READINESS (a) ✅ ; `notify-extra.txt` vide (rien en
attente). Signaux Sentry/quality_alerts inchangés (data test, 0 actionable). Le réversible « chemin d'écriture
stock non testé » côté FACTURE est épuisé (validate/activate/receive/cancel tous couverts les runs précédents).
→ §6.3 chemin critique non testé restant = **les route handlers WEBHOOK** (2e pilier north-star « temps réel
honnête »). Vérifié : `pos-webhook-parse` teste les adapters, `pos-resolve-product` teste la résolution, mais
**AUCUN test ne drive le route handler de bout en bout** (`grep -rl "webhooks/" tests/` = 0). Or c'est lui qui
orchestre le contrat critique signature→idempotence→resolve→`updateStockAtomic`→recalc→Google.

**TROUVÉ (vérifié dans le code réel, pas Explore) — 1 bug de fraîcheur + 1 HIGH recalc** :
- **Bug fraîcheur (classe garde cosmétique maillon 5)** : `shopifyAdapter.parseWebhookEvent` mettait
  `updated_at: new Date().toISOString()` (heure de RÉCEPTION) → le `source_ts` transmis à `update_stock_atomic`
  était faux → un webhook Shopify livré en retard (retry/outage) affichait « vu à l'instant / Disponible » pour
  une vente passée = **faux positif de fraîcheur** (north-star « afficher honnêtement »). Or l'objet order Shopify
  porte toujours `updated_at`/`created_at`/`processed_at`. **Lightspeed (`line.timeStamp`) et Square
  (`calculated_at`) extrayaient déjà le vrai timestamp** → Shopify était le seul jumeau à jeter la fraîcheur. Le
  commentaire de la route (« source_ts = heure de l'événement ») mentait pour Shopify. Le test de parse existant
  l'« actait » (« pas d'horodatage par ligne → fallback ») — vrai par LIGNE, faux au niveau ORDER.
  Fix : `event.updated_at || event.created_at || event.processed_at || now()` (`||` : "" inutilisable → fallback ;
  fallback = byte-identique à l'ancien comportement si rien présent).
- **HIGH (revue SF-hunter, classe « throw vs captureError-et-continue ») : `await recalculateGroupSizesAdmin()`
  non gardé dans les 2 routes** → un throw réseau (≠ erreurs Supabase qu'il capture en interne) remonte au catch
  route → 500 APRÈS que le stock a été décrémenté → retry POS → idempotence skip (`webhook_id` déjà vu) → recalc
  JAMAIS rejoué (available_sizes périmé jusqu'au resync 6h). Le stock autoritaire est committé ; recalc = méta
  d'affichage dérivée → **captureError-et-continue** (comme `feedErr`/`notify`/`google` le sont DÉJÀ dans la même
  route), pas un throw. Corrigé sur les 2 jumeaux.

**FIX** : (1) parser Shopify reporte le vrai timestamp order ; (2) recalc wrappé en try/catch+captureError dans
shopify+lightspeed (200 conservé, stock déjà committé).

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff pipeline) : core fix parser **SOUND** (fallback préserve,
aucune perte introduite) ; tests **non vacants** (`source_ts`=heure événement vérifié directement, idempotence
prouvée). 1 HIGH (recalc) **corrigé ce run** ; findings test (processed_at non testé, JSON-invalide-avec-id,
resolve-throw vs null) **verrouillés ce run**. Findings LOW laissés hors scope (NON introduits, documentés) :
#6 lookup Google dupliquée (utilise une 2e query au lieu de `product.merchant_id` ; merchantErr déjà captureError
→ dégradation visible, Google re-sync 3h) ; #7 webhook sans `webhook_id` traité sans alerte (Shopify/Lightspeed
envoient toujours l'ID ; ajouter un captureError risquerait de flooder Sentry sans throttle) → durcissement futur.

**PREUVE RÉELLE (méthode §1bis)** : `tests/webhook-routes-stock.test.ts` (+18 = 9 contrats × 2 jumeaux) drive le
VRAI `POST` route : signature invalide → 401 + 0 effet de bord ; doublon `webhook_id` → skip + 0 décrément ;
erreur lecture/insert idempotence → 500 + captureError + 0 décrément ; happy → `updateStockAtomic(prod-1, -2,
"delta", "webhook", "2026-06-19T10:00:00Z")` (source ET source_ts=heure événement vérifiés champ par champ) +
feed_event "sale" ; resolve null → skip 200 ; resolve throw → 500 ; recalc throw → **200** (stock committé) +
captureError ; updateStock throw → 500 ; sans webhook_id → idempotence sautée + traité ; JSON invalide (avec et
sans id) → 400. + `tests/pos-webhook-parse.test.ts` (+4) : Shopify reporte le vrai `updated_at`/`created_at`/
`processed_at`, fallback ISO si tout absent.

**TESTÉ** : `npm run test:run` → **776/776** (749→776, +27), `tsc` OK. 5 fichiers (3 prod : shopify.ts +
2 routes ; 2 tests). 0 migration, réversible (`git revert`). Impact (gitnexus) : `parseWebhookEvent` shopify
appelé uniquement par la route shopify ; recalc inchangé en signature. Contrat appelant préservé.

**Reste / suivi** : le réversible « hot path stock non testé » se raréfie encore (factures + webhooks couverts).
La valeur bascule de plus en plus côté Thomas (pilote, chantier B visuel). Durcissements résiduels = Rang 2 gated
(idempotence at-most-once déjà escaladée ; lookup Google dupliquée ; alerte webhook-sans-id).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — vrai `POST` route exercé champ par champ (source_ts=heure événement vérifié, idempotence,
  401/500/200 par mode d'échec), sur les 2 jumeaux. Unitaire (faux client/adapters mockés), pas vrai POS.
- **Sécurité north-star : 8/10** — revue SF-hunter : 0 silent-failure introduit ; **1 bug de fraîcheur réel**
  (faux positif « vu à l'instant ») + **1 HIGH** (recalc throw → perte du rollup au retry) comblés ; jumeaux alignés.
- **Réversibilité : 10/10** — 0 migration, 3 prod + 2 tests, `git revert` propre, signatures inchangées.
- **Discipline de scope : 9/10** — 1 canal (webhook temps réel) ciblé + son test ; le HIGH recalc est dans le
  code exactement couvert ; findings LOW explicitement hors scope (pas de dérive).
- **Alignement north-star : 8/10** — durcit le 2e pilier (temps réel honnête) : une vente affichée « à l'instant »
  des heures après, ou un rollup tailles perdu, = faux positif du type qui tue (MVMS/Milo). Valeur pleine au 1er pilote.

**Métriques objectives** : tests 749→776 (+27) ; **2 bugs réels** corrigés (fraîcheur Shopify + recalc HIGH) ;
5 fichiers touchés. CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert détecté → **100 %**.

---

## 2026-06-23 (run autonome) · COUVERTURE Rang 3 — **`POST /api/invoices/[id]/cancel` (annulation → réversion stock) durci + testé** : 1 CORRUPTION + 3 pertes silencieuses

**Sourcing (§6)** : chaîne A 1→8 ✅ + Phase D ✅/escaladé + READINESS (a) ✅ ; runs récents = `activateInvoice`,
`stock/receive`. Haut du backlog = escaladé/externe ; `notify-extra.txt` vide (rien en attente). Signaux Sentry/
quality_alerts inchangés depuis 2026-06-23 (data test, 0 actionable, vérifié au run précédent). → §6.3 **chemin
d'écriture stock NON testé**. Codemap `01-data-pipeline.md §1d` + `02-api-routes.md` : `invoices/[id]/{validate,
activate}` couverts (runs précédents), **`cancel` PAS** — or il MUTE le stock (réverse la marchandise reçue quand
le marchand annule une facture mal saisie). Lu d'abord : `stock/cloture` (candidat) = **écarté** (n'écrit PAS le
stock, juste un record de streak gamifié) → pas north-star. `cancel` = vraie écriture stock.

**TROUVÉ (vérifié dans le code) — 1 corruption + 3 pertes silencieuses, même classe que `resync-stock`/invoice-validate** :
- **#1 (CORRUPTION, north-star)** : la route appelait `admin.rpc("increment_stock_quantity", …)` — **RPC qui
  n'existe dans AUCUNE migration** (grep `supabase/migrations/` : 0 résultat) → `res.error` toujours vrai → le
  fallback tournait à CHAQUE annulation. Et ce fallback faisait `const { data: current } = await admin.from("stock")
  .select("quantity")…` (error avalé) → sur un blip DB `current=null` → `next = max(0, (null ?? 0) - delta) = 0` →
  **le stock du produit FORCÉ À 0** (au lieu d'être décrémenté) = vraie quantité écrasée, faux « rupture » silencieux.
- **#2 (north-star)** : l'`update` de réversion (`admin.from("stock").update(...).eq(...)`) avalait son `error` → un
  échec d'écriture laissait le stock NON décrémenté mais la facture quand même remise en `parsed` → **stock fantôme
  gonflé derrière un faux « annulée »** (la marchandise « retirée » reste comptée en stock).
- **#3** : la remise à jour du statut facture (`update {status:"parsed"…}`) avalait son `error`.
- **#4 (revue SF-hunter, MED)** : la lecture `invoice_items` (qui détermine les deltas) avalait son `error` → un
  blip → `stockDeltas={}` → annulation « réussie » avec **0 réversion** = stock fantôme. Corrigé ce run.
- Mêmes #1/#2 sur le chemin **correctif** (>10 min) ; insert `invoice_items` correctif (audit) aussi avalé.

**FIX** : helper unique `reverseStock(productId, delta)` (read err → captureError + return false **sans jamais
écrire 0** ; update err → captureError + return false ; sinon décrémente). Hard-undo ET correctif comptent les
échecs : réversion partielle → **500 honnête** (`{reversed, failed}`) **sans** remettre la facture en `parsed`
(elle reste annulable) ; reset-statut err → captureError + 500 ; items_read err → captureError + 500. Suppression
de la RPC fantôme + du commentaire « fallback » trompeur.

**REVUE OBLIGATOIRE `silent-failure-hunter`** : **0 silent-failure INTRODUIT** ; mes 4 améliorations SOUND
(suppression RPC morte, garde read-error dans `reverseStock`, blocage du reset facture sur échec partiel, items_read).
Finding 1 (MED, items_read avalé) **corrigé ce run**. Résidus signalés **PRÉ-EXISTANTS, hors scope** (NON introduits) :
réversion delta non idempotente au retry (re-décrément borné à 0) ; correctif ré-exécutable (original non marqué
« corrigé ») ; update sans ligne stock = no-op silencieux ; Sentry-outage invisible. → durcissement Rang 2 (idempotence/
ledger), pas ce run (anti scope-creep).

**PREUVE RÉELLE (méthode §1bis)** : `tests/invoice-cancel-writes.test.ts` (+10) — on drive la VRAIE route `POST`
avec un faux client Supabase qui ENREGISTRE les écritures de stock + injecte des erreurs ciblées par produit. Prouvé
champ par champ : hard-undo happy (prod-1 20→15, prod-2 10→7, facture→parsed, 0 Sentry) ; **#1 read blip → prod-1
RESTE à 20 (PAS écrasé à 0)** + 500 + captureError + facture NON resetée ; #2 update err → 500 visible ; partiel
(1 ok/1 échoue) → 500 + `failed:1` + l'item OK bien décrémenté ; #3 reset-statut err → 500 ; #4 items_read err →
500 + 0 stock touché ; correctif happy (corrective créée + 2 items + stock réversé) ; correctif read blip → pas de 0.
TDD : **5 rouges d'abord** (corruption #1, #2, #3, partiel, correctif-corruption) → fix → 10 verts.

**TESTÉ** : `npm run test:run` → **749/749** (739→749, +10), `tsc` OK. 2 fichiers (1 route + 1 test). 0 migration,
réversible (`git revert`). Impact : route handler, 1 seul caller (`dashboard/invoices/[id]/page.tsx` lit `res.ok` +
`data.mode`) → contrat préservé (200 `{mode}` succès, 500 sur échec déjà géré par `!res.ok`).

**Reste / suivi** : haut du backlog reste escaladé/externe. Le réversible « chemin d'écriture stock non testé » se
raréfie encore (validate/activate/receive/cancel désormais couverts) → §5.4 honnêteté de rendement : la valeur
bascule de plus en plus côté Thomas (pilote, chantier B visuel). Durcissement idempotence cancel = Rang 2 (gated).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — chemin réel `POST cancel` exercé champ par champ (écritures stock enregistrées, erreurs
  injectées par produit), divergence vs l'avant prouvée (TDD 5 rouges, dont la CORRUPTION à 0). Unitaire (faux client).
- **Sécurité north-star : 9/10** — revue SF-hunter : 0 silent-failure introduit ; **corruption réelle** (stock forcé
  à 0 sur blip, via RPC fantôme jamais détectée) + 3 pertes silencieuses comblées ; Finding MED adjacent corrigé.
- **Réversibilité : 10/10** — 0 migration, 1 route + 1 test, `git revert` propre, contrat appelant préservé.
- **Discipline de scope : 9/10** — 1 route ciblée + son test ; tout same-class same-file ; résidus pré-existants
  explicitement laissés hors scope (pas de dérive idempotence/ledger).
- **Alignement north-star : 8/10** — durcit un canal d'écriture stock réel (« afficher honnêtement ») ; un stock
  écrasé à 0 ou non réversé = faux positif exactement du type qui tue (MVMS/Milo). Valeur pleine au 1er marchand.
**Objectif (§5bis)** : tests 739→749 (+10) ; **4 défauts réels** comblés (1 corruption + 3 pertes silencieuses) ;
2 fichiers ; CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert → **100 %**.

---

## 2026-06-23 (run autonome) · COUVERTURE Rang 3 — **`POST /api/stock/receive` (livraison reçue → stock) durci + testé** : 1 perte silencieuse north-star + 2 adjacentes

**Sourcing (§6)** : chaîne A 1→8 ✅ + Phase D ✅/escaladé + READINESS (a) ✅ + dernier run `activateInvoice` ✅.
Haut du backlog = escaladé/externe (D2/D5/D6 GO Thomas, chantier B visuel, pilote). Signaux Sentry/quality_alerts
vérifiés au run précédent (0 actionable, alertes = data test périmée). → §6.3 **chemin critique d'écriture NON
testé**. Codemap `01-data-pipeline.md` §1d : `api/stock/receive` (source="scan"/livraison) écrit le stock via la
RPC atomique `receive_stock_incoming` (incrémente stock + marque ligne `received` + feed_event `restock`) — **0 test**.

**TROUVÉ (vérifié dans le code, pas supposé) — 1 perte silencieuse north-star + 2 adjacentes, même classe que
`resync-stock` (`if(!error) updated++`) / invoice-validate (« erreur ≠ succès »)** :
- **#1 (north-star)** : la boucle faisait `await admin.rpc("receive_stock_incoming", …)` **SANS destructurer
  `error`**, puis `received++` quoi qu'il arrive. Un échec RPC (blip DB / contrainte / RAISE) → le stock n'est PAS
  incrémenté, la ligne reste `incoming`, MAIS la réponse annonce « received: N » → **le marchand croit son stock à
  jour = livraison perdue en silence, derrière un voyant vert.** Fix : destructurer `error` ; sur erreur →
  `captureError` + `failed++` + `continue` (la RPC est atomique par item → un échec ne demi-applique rien et laisse
  la ligne `incoming` = re-cliquable, **idempotent**, pas de double comptage) ; `received` ne compte QUE les succès
  réels. Contrat de réponse honnête : `received===0 && failed>0` → **500** (l'UI affiche « Erreur » au lieu d'un
  faux « stock mis à jour ») ; partiel → 200 avec `{received, failed}` (received honnête, lignes échouées re-cliquables).
- **#2** : la lecture `stock_incoming` avalait son `error` (`const { data } = await query`) → un blip DB devenait
  indistinct de « aucune livraison en attente » (`404 No incoming stock found`) = faux diagnostic. Fix : distinguer
  (throw→captureError+500 sur erreur ; vide RÉEL [error null, []] reste 404).
- **#3 (revue SF-hunter, MED)** : lookup marchand `.single()` transformait un blip DB en `404 No merchant` (même
  classe). Fix : `captureError`+500 si `merchantErr.code !== "PGRST116"` ; PGRST116 (0 ligne) reste 404 légitime.
  + erreur `auth.getUser()` désormais `captureError` (observabilité panne auth ; le 401 bloque déjà).

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff pipeline) : **mes 3 changements SOUND**. Confirmé : (1)
distinction error/empty fiable (Supabase renvoie `error:null` à 0 ligne) ; (2) capture-and-continue correct +
idempotence prouvée (RPC atomique → ligne reste `incoming`) ; (3) contrat partiel honnête (received = succès réels,
échec total = 500). 2 findings MED adjacents (lookup marchand `.single()`→404, auth error avalée) **corrigés ce run**.
Finding LOW (createAdminClient guard) déjà sûr (catch externe → captureError). 0 régression.

**PREUVE RÉELLE (méthode §1bis)** : `tests/stock-receive-writes.test.ts` (+8) — on drive la VRAIE route `POST` avec
un faux client qui ENREGISTRE les appels RPC + injecte des erreurs ciblées par incoming-id. Prouvé champ par champ :
happy 2 lignes (2 RPC `{incomingId,productId,delta}` exacts, received=2, 0 Sentry) ; #1 RPC échoue sur 1 item →
received=1 (honnête) + failed=1 + 1 captureError ; #1 toutes échouent → 500 + received non annoncé + 2 captureError ;
#2 incoming err → 500 + 0 RPC ; vide réel → 404 ; #3 merchant blip → 500 ; merchant absent (PGRST116) → 404. TDD :
3 rouges d'abord → fix → 8 verts.

**TESTÉ** : `npm run test:run` → **739/739** (731→739, +8), `tsc` OK. 2 fichiers (1 route + 1 test). 0 migration,
réversible (`git revert`). Impact (hook GitNexus) : route handler, 1 appelant (`factures-view.tsx handleConfirmDelivery`
lit `data.received`, gère `!res.ok`) → contrat préservé (`failed` additif, `received` honnête, 500 sur échec total).

**Reste / suivi (anti scope-creep)** : haut du backlog reste escaladé/externe. Le réversible « chemin d'écriture non
testé » se raréfie (la plupart des hot paths d'écriture stock sont désormais couverts) → §5.4 honnêteté de rendement :
la valeur bascule de plus en plus côté Thomas (pilote, chantier B visuel) ; encore quelques routes d'écriture
secondaires à auditer.

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — chemin réel `POST /api/stock/receive` exercé champ par champ (appels RPC enregistrés + erreurs
  injectées par item), divergence vs l'avant prouvée (TDD 3 rouges). Unitaire (faux client, pas un vrai marchand POS).
- **Sécurité north-star : 9/10** — revue SF-hunter SOUND ; perte silencieuse n°1 (livraison « reçue » sans stock
  incrémenté derrière voyant vert) comblée ; idempotence prouvée ; 2 findings MED adjacents corrigés ; 0 régression.
- **Réversibilité : 10/10** — 0 migration, 1 route + 1 test, `git revert` propre, contrat appelant préservé.
- **Discipline de scope : 9/10** — 1 route ciblée + son test ; findings adjacents même-classe même-fichier ; pas de dérive UI/RPC.
- **Alignement north-star : 8/10** — durcit un canal d'écriture stock réel (« ne rien oublier ») ; valeur pleine au
  1er marchand qui confirme une livraison (gated pilote) → 8.
**Objectif (§5bis)** : tests 731→739 (+8) ; **3 pertes silencieuses** réelles comblées (1 north-star + 2 adjacentes) ;
2 fichiers ; CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert → **100 %**.

---

## 2026-06-23 (run autonome) · COUVERTURE Rang 3 — **`activateInvoice` (push catalogue POS) durci + testé** : 1 perte silencieuse north-star + 4 adjacentes

**Sourcing (§6)** : chaîne A 1→8 ✅ + Phase D (D1/D3/D4/D7 ✅, D2/D5/D6 préparés+escaladés) ✅ + READINESS (a) ✅.
Haut du backlog = escaladé/externe. **Signaux réels vérifiés en prod (§6.2, Supabase MCP)** : 9 marchands test, 1
connexion POS, 106 `quality_alerts` ouvertes (104 `stock_stale` + 1 `price_aberrant` + 1 `pos_disconnected`) —
**toutes explicables par data test périmée + 1 POS test déconnecté** (les crons signalent correctement = système qui
marche, pas un défaut code ; rien de neuf depuis 2026-06-22) → **0 signal code actionnable**. → §6.3 : **chemin
critique d'écriture NON testé**. `activateInvoice` (`src/lib/invoice/activate.ts`, route live `POST /api/invoices/[id]/
activate`) — pousse le catalogue groupé vers la caisse (`pushCatalog`) + écrit le mapping `pos_item_id` — **0 test**.

**TROUVÉ (vérifié dans le code, pas supposé) — 1 perte silencieuse north-star + 4 adjacentes, même classe que
maillon 8 / `resolveWebhookProduct` (« erreur DB ≠ rien à faire »)** :
- **#1 (north-star)** : lecture `pos_connections` avalait son `error` (`maybeSingle()` non destructuré). Blip DB →
  `conn=null` → **marchand POS traité comme NON-POS** → facture marquée `imported` MAIS catalogue **JAMAIS poussé** →
  produits sans `pos_item_id` → plus aucun stock temps réel = **perte silencieuse de la propagation POS**. Fix :
  destructurer `error` → throw + captureError (route → 500 + retry). Absence VRAIE de connexion = `{data:null,
  error:null}` (distinct → branche non-POS intacte).
- **#2** : lecture `invoice_items` avalée → un blip se présentait comme « run validate first » (faux diagnostic).
  Fix : throw + captureError ; le vide RÉEL (sans erreur) garde « run validate first » sans Sentry (erreur user).
- **#3** : écriture du mapping `pos_item_id` (après push RÉUSSI) avalée → produit dans la caisse mais mapping perdu =
  webhooks futurs non résolus, en silence. Fix : captureError SANS throw (re-run re-pousserait → doublon POS).
- **#3a/#3b** (revue SF-hunter) : lectures `products` et `invoice` ne **throwaient que** sans `captureError` →
  l'erreur Supabase d'origine (code/hint) perdue côté Sentry. Fix : captureError avant throw + séparer le VRAI
  « introuvable » du blip DB.
- **#4** : les 3 MAJ de statut facture avalaient leur `error` → facture « bloquée » sans signal. Fix : helper unique
  `markInvoiceImported` (captureError, non-bloquant car le catalogue est déjà poussé).

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff pipeline) : **fixes SOUND**. Confirmé : (1) `.maybeSingle()`
renvoie `error:null` à 0 ligne → le non-POS légitime ne throw jamais (et 2 lignes = PGRST116 correctement remonté) ;
(2) capture-and-continue #3 correct (throw → doublon POS) ; (4) `markInvoiceImported` non-bloquant approprié.
Findings 3a/3b adressés. **3c réfuté par vérif** : `markProductsRedispo` est DÉJÀ non-throwing (try/catch +
captureError, retourne void) → ne peut pas propager. `validated_at` réécrit au retry = cosmétique, hors périmètre.

**PREUVE RÉELLE (méthode §1bis)** : `tests/invoice-activate-writes.test.ts` (+11) — faux client Supabase stateful
qui ENREGISTRE les écritures + injecte des erreurs ciblées (par table + par payload pour viser le mapping vs redispo).
Prouvé champ par champ : happy POS (push + mapping `pos-999` écrit + `imported`), non-POS sans erreur (0 push, 0
Sentry), #1 (conn err → throw, **pushCatalog PAS appelé, facture PAS imported**, captureError), #2/#2b (err vs vide),
#3 (mapping err → captureError sans throw, imported quand même), #3a/#3b, #4, pushCatalog throw (PAS imported),
produits déjà en POS (0 push). TDD : 4 rouges d'abord → fix → 11 verts.

**TESTÉ** : `npm run test:run` → **731/731** (720→731, +11), `tsc` OK, pre-push vert. 2 fichiers (1 lib + 1 test).
0 migration, réversible (`git revert`). Impact (hook GitNexus) : `activateInvoice` appelé par 1 seul caller (route
`POST`), signature inchangée → callers non affectés, risque LOW.

**Reste / suivi (anti scope-creep)** : haut du backlog reste escaladé/externe (D2/D5/D6 GO Thomas, chantier B visuel,
pilote marchand). Prochain `[R]` boucle = autre chemin d'écriture non testé si signal, sinon honnêteté de rendement
§5.4 (le réversible se raréfie ; la valeur bascule côté Thomas/pilote).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — chemin réel `activateInvoice` exercé champ par champ avec écritures enregistrées + erreurs
  injectées ciblées ; divergence vs l'état d'avant prouvée (TDD 4 rouges). Mais unitaire (faux client, pas un vrai
  POS ni vrai marchand).
- **Sécurité north-star : 9/10** — revue SF-hunter SOUND ; la perte silencieuse n°1 (catalogue POS jamais poussé sous
  blip DB) comblée ; distinction error/empty prouvée ; 0 régression (non-POS légitime intact).
- **Réversibilité : 10/10** — 0 migration, 1 lib + 1 test, `git revert` propre, signature inchangée.
- **Discipline de scope : 9/10** — 1 fonction ciblée + son test ; helper DRY pour 3 sites jumeaux ; pas de dérive.
- **Alignement north-star : 8/10** — durcit un canal d'écriture stock/catalogue réel (« ne rien oublier ») ; valeur
  pleine au 1er marchand POS via facture (gated pilote) → 8.
**Objectif (§5bis)** : tests 720→731 (+11) ; **5 pertes silencieuses** réelles comblées (1 north-star + 4 adjacentes) ;
2 fichiers ; CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert → **100 %**.

---

## 2026-06-23 (run autonome) · READINESS — **(a) Checklist go-live pilote RÉDIGÉE + readiness LFP rendue PROGRAMMATIQUE** + 1 bug réel (revue SF-hunter HIGH)

**Sourcing (§6)** : chaîne A 1→8 ✅ + D1/D3/D4/D5/D6/D7 prouvés + D2 préparé/escaladé. Backlog en premier →
section READINESS nomme explicitement le prochain `[R]` : **« (a) checklist go-live pilote rédigée »**. Vérifié
le code réel d'abord (LESSONS ~70 % faux findings) : (1) AUCUN bouton « Request inventory verification » dans
`src/` (grep) → c'est une action **côté Google MC du marchand**, pas du software manquant (prémisse corrigée) ;
(2) le seuil LFP « ≥11 offres » ne vivait **QUE dans la prose** (`google-lfp-preparation-v2.md`), nulle part en
code → `/api/google/stats` montrait un compte brut + score % mais ne répondait jamais « prêt LFP ou pas ».

**DÉCISION** : ne pas livrer QU'un doc. Le vrai trou north-star = la readiness n'est pas un invariant TESTÉ.
→ encoder le seuil + le verdict en software vérifiable, puis ancrer la checklist dessus.

**FAIT (réversible, 0 migration)** :
- **NEW `src/lib/google/pilot-readiness.ts`** : source unique `LFP_MIN_PUBLISHABLE_OFFERS=11` +
  `evaluateFeedReadiness({publishable, googleConnected})` pur → `{meetsOfferThreshold, offerShortfall,
  feedReady, blockers[]}`. `feedReady` = seuil atteint ET connecté. Codes blocker stables
  (`below_offer_threshold`/`google_not_connected`). Garde défensive : compte négatif/NaN → 0 (jamais publiable).
- **EDIT `src/app/api/google/stats/route.ts`** : ajoute un read `google_merchant_connections` (`.maybeSingle()`,
  erreur DB ≠ « pas connecté » → 500+captureError, anti faux négatif) + expose `lfp_feed_ready`,
  `lfp_meets_offer_threshold`, `lfp_offer_shortfall`, `google_connected`, `lfp_blockers`, `lfp_offers_threshold`.
  `publishable` réutilise le VRAI gate (`isFeedEligible`) → readiness ne peut pas diverger de ce qui publie.
- **NEW `docs/prospection/go-live-checklist.md`** : checklist binaire ancrée sur `GET /api/google/stats`
  (maillons software vérifiables) + maillons externes (BP vérifié + lié MC + clic « Request inventory
  verification ») clairement marqués « hors champ boucle ».

**TROUVÉ (revue SF-hunter, HIGH, vérifié par calcul + grep) — 1 bug réel** : `summarizePublishability` hardcodait
`allowMissingImage:false`, mais les 2 feeds (`feed.ts:101`, `lfp-xml.ts:56`) passent `gtinOnlyTierEnabled()`.
→ flag `GOOGLE_GTIN_ONLY_TIER=1` (que D2 active au 1er pilote), le KPI SOUS-COMPTAIT les produits GTIN+prix sans
image que le feed PUBLIE → `lfp_feed_ready` faussement `false` au moment EXACT du go-live = faux négatif de
readiness. **Même classe que D3** (« un KPI qui prédit un gate réutilise le prédicat DU gate »). Fix : `allowMissingImage`
threadé dans `summarizePublishability` + route passe `gtinOnlyTierEnabled()` → parité KPI↔feed dans les 2 états.
Comportement flag OFF **préservé byte-for-byte** (publishable exige l'image → branche missing_image jamais atteinte).
Findings MED (getUser error→401 silencieux) et LOW (Math.floor) : **non retenus** — MED pré-existant + LESSONS dit
auth `null→401` est le pattern CORRECT (pas une perte à chasser) ; LOW = chemin jamais atteint (caller produit des int).

**PREUVE RÉELLE (méthode §1bis)** : `tests/lib/google/pilot-readiness.test.ts` (+11, champ par champ : seuil exact
11, sous-seuil, 0/négatif/NaN, déconnecté, ordre blockers stable) ; `publishability.test.ts` (+4 : chemin réel route
→ readiness OK/pas-prêt/erreur connexion 500 ; parité flag OFF→{a}/ON→{a,b}). Sorties JSON inspectées.

**TESTÉ** : `npm run test:run` → **720/720** (705→720, +15), `tsc` OK, pre-push vert. 5 fichiers (2 lib + 1 route
+ 2 tests) + 3 docs. NB : `merge-readiness.md` est périmé (dit merge pending, or merge+deploy FAITS) — à rafraîchir
hors de cette unité.

---

## 2026-06-23 (run autonome) · PHASE D — **D2 `[G]` Tier GTIN-only préparé derrière flag (OFF) + escaladé** + 1 bug réel · commit `81d17d1`

**Sourcing (§6)** : chaîne A + D1/D3/D4/D5/D6/D7 faits ; seul item Phase D non traité = **D2** (`[G]`). Vérifié
dans le code réel d'abord (LESSONS ~70 % faux findings) → **prémisse de D2 confirmée** : `isFeedEligible`
exige GTIN+prix+**image** ; le KPI D3 trace déjà `blocked_only_by_image` (GTIN+prix OK, image seule manquante)
= « cible D2 ». Les 2 routes feed (cron `google-feed` Voie A + `feed/lfp/[merchantId]` Voie B) sélectionnent
TOUS les produits visible+validés et délèguent le gate image à la lib → **relâcher la lib derrière un flag
suffit, 0 changement SQL/route**.

**FAIT (réversible, 0 migration, flag OFF par défaut = 0 changement prod)** :
- `feed-eligibility.ts` : `gtinOnlyTierEnabled(env)` (lit `GOOGLE_GTIN_ONLY_TIER`, `1`/`true` → ON) +
  `isFeedEligible(p, {allowMissingImage})` (image optionnelle SI tier ON ; GTIN+prix TOUJOURS requis —
  la relaxation ne touche QUE l'image).
- `feed.ts` (Voie A) : `filterEligibleProducts(.., allowMissingImage=gtinOnlyTierEnabled())` ; `GoogleProduct.imageLink`
  rendu **optionnel** (émis seulement si image) → `JSON.stringify` (route `productInputs:insert`) **omet** la clé →
  Google matche par GTIN, jamais un `imageLink:null` explicite (rejetable).
- `lfp-xml.ts` (Voie B) : `filterFeedEligible`/`buildLfpXml` threadent le flag ; `<g:image_link>` **omis** quand
  photo vide (jamais de balise VIDE — pire qu'absente côté Google).
- **PARITÉ Voie A/B préservée** : les 2 canaux lisent le **MÊME** flag → émettent le MÊME ensemble dans les
  2 états (classe store_code/maillon 7, prouvé par test dédié).

**TROUVÉ (revue SF-hunter, vérifié) — 1 bug réel adjacent** : `hasImage` comptait une chaîne `""` comme une
image (`"" !== null` → true) → un produit dont `photo_url=""` (back-fill DB en "" au lieu de NULL) passait
l'éligibilité ET émettait un `g:image_link` VIDE = rejet Google silencieux. Durci : `!== null && !== ""`
(parité — les 2 canaux + le KPI `summarizePublishability` partagent `hasImage`, donc honnête partout).

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff = canal de sortie Google) : **core SOUND, 0 silent-failure
introduit**. Findings : (1) parité — vérifié OK (default-param évalué au call-time, les 2 canaux lisent le même
flag ; `buildLfpXml` résout une fois et thread) ; (2) `imageLink` undefined→Content API — vérifié : la route fait
`JSON.stringify` qui omet `undefined` → plus sûr que l'ancien `null` ; (3) `""`→image vide = corrigé ci-dessus.

**PREUVE RÉELLE** (méthode §1bis) : `tests/lib/google/gtin-only-tier.test.ts` (+16) — flag OFF (défaut) exclut
le produit sans image des 2 feeds ; flag ON l'inclut SANS imageLink (JSON) / SANS `<g:image_link>` (XML) ;
relaxation image SEULE (sans GTIN/prix reste exclu même tier ON) ; **parité A/B** : `{a}` flag OFF, `{a,b}`
flag ON (b sans image rejoint le tier), jamais c (sans GTIN)/d (prix 0) ; `""`≠image. Sorties XML/JSON inspectées.

**TESTÉ** : `npm run test:run` → **705/705** (704→705, +16 nouveaux dont -1 doublon d'assertion), `tsc` OK,
pre-push vert. 4 fichiers (3 lib + 1 test).

**ESCALADE (§4)** : `logs/notify-extra.txt` — `[DECISION]` activer `GOOGLE_GTIN_ONLY_TIER=1` au 1er pilote
(option A) vs garder OFF (B). Réversible (revert flag). Ne PAS activer seul (réputation compte Google). MESURE
déjà en place : cron `google-status` (`destinationStatuses` → `quality_alerts google_disapproved`) + KPI D3.

**Reste / suivi (anti scope-creep)** : prochain `[R]` boucle = **checklist go-live pilote** (READINESS (a)).
D6 shadow/preview UI + validation visuelle = chantier B (Thomas, pas de navigateur).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — feeds exercés champ par champ (JSON Voie A + XML Voie B), parité prouvée dans les 2 états
  du flag, divergence vs l'état d'avant prouvée ; mais unitaire (pas un vrai push Content API ni vrai marchand).
- **Sécurité north-star : 9/10** — revue SF-hunter SOUND ; parité A/B verrouillée par test (anti-catalogue
  fantôme) ; bug réel `""`→image vide comblé ; flag OFF = 0 changement prod, activation gated.
- **Réversibilité : 10/10** — 0 migration, flag OFF par défaut, params additifs (default = ancien comportement),
  `git revert` propre.
- **Discipline de scope : 9/10** — 3 fichiers lib (mêmes que le gate) + 1 test ; 0 changement SQL/route (vérifié
  inutile) ; D2 amené au point d'escalade sans sur-construire.
- **Alignement north-star : 8/10** — débloque le levier NearSt (Google enrichit) compatible Google ; mais valeur
  réelle seulement une fois activé au pilote (gated) → 8.
**Objectif (§5bis)** : tests 704→705 ; **1 bug réel** comblé (`g:image_link` vide possible sur `photo_url=""`) ;
4 fichiers ; CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert → **100 %**.

---

## 2026-06-23 (run autonome) · PHASE D — **D6 (partiel) `[R]` Contrat read-only STOCK prouvé** + 2 trous réels comblés · commit `618c31a`

**Sourcing (§6)** : chaîne A + D1/D3/D4/D5/D7 faits ; haut backlog Phase D non terminé = **D6** (item `[R]`).
Vérifié dans le code réel d'abord (LESSONS ~70 % faux findings) → **la prémisse de D6 « aucun adaptateur POS
n'écrit vers la caisse » est PARTIELLEMENT FAUSSE** : `IPOSAdapter` expose 2 méthodes d'écriture vers le POS —
`pushCatalog` (câblé, ungated, via `activateInvoice` sur validation facture) et `updatePosProduct` (EAN, Square
seul, flag `POS_WRITEBACK_ENABLED`). MAIS, vérifié sur les 3 implémentations (Square `/catalog/batch-upsert`,
Shopify `POST /products.json`, Lightspeed `Item.json`) : **aucune n'écrit de QUANTITÉ DE STOCK** — elles créent
du CATALOGUE (name/price/EAN/sku). La vraie promesse north-star (« ne pas casser sa gestion de stock ») = **ne
jamais réécrire les quantités d'inventaire vers la caisse** — et CET invariant tient. C'est lui que je verrouille.

**TROUVÉ (vérifié dans le code, pas supposé) — 2 trous réels au consentement/observabilité** :
1. **Scopes OAuth d'écriture d'inventaire DEMANDÉS mais jamais utilisés.** Square `getAuthUrl` demandait
   `INVENTORY_WRITE`, Shopify `write_inventory` — or **aucun chemin de code n'appelle d'endpoint d'écriture
   d'inventaire** (Square `getStock` = `/inventory/counts/batch-retrieve` lecture ; Shopify `getStock` =
   `inventory_levels.json` GET ; les writes stock vont vers Supabase via RPC, jamais vers le POS). Conséquence :
   l'écran de **consentement marchand** affichait « peut modifier mon inventaire » = contredit la promesse
   read-only + viole le moindre-privilège (LESSONS OAuth). Lightspeed (`employee:inventory_read`) et Zettle
   (pas de `WRITE:INVENTORY`) faisaient déjà bien.
2. **Shopify `pushCatalog` droppait un produit en SILENCE sur HTTP !ok** (finding SF-hunter MED) : un produit
   créé côté Two-Step mais refusé par Shopify (422/429/401) n'obtenait jamais de `pos_item_id` → ne recevait
   jamais les MAJ stock du POS = perte silencieuse (vente/dispo fantôme).

**FAIT (réversible, 0 migration)** :
- `square.ts` : scope `INVENTORY_WRITE` retiré (gardé `INVENTORY_READ` pour getStock, `ITEMS_WRITE` pour
  pushCatalog/updatePosProduct). `shopify.ts` : scope `write_inventory` retiré (gardé `read_inventory`,
  `write_products`). Narrowing = sûr : les tokens déjà accordés gardent leur grant, seules les NOUVELLES
  autorisations demandent moins ; pas de changement requis côté app Square/Shopify (on demande un sous-ensemble).
- `shopify.ts pushCatalog` : `!res.ok` → `captureError`+`continue` (rendu visible, pas avalé ; le produit existe
  dans notre DB, un prochain push le re-tente → pas de throw qui figerait toute la création).
- **Test** `tests/pos-readonly-stock-contract.test.ts` (+17) : **A** aucun `getAuthUrl` ne demande l'écriture
  d'inventaire (4 OAuth adapters) + détecteur anti-vacant ; **B** aucun adaptateur n'expose de méthode
  d'écriture de stock (6 adapters, `getStock` seule lecture autorisée) ; **C** `pushCatalog` (Square/Shopify/
  Lightspeed) n'émet aucune mutation de quantité (recording fetch + `isInventoryWrite`) + preuve positive
  (write catalogue bien émis) ; **+** échec 422 Shopify → captureError (Finding #3) ; **D** Square
  `updatePosProduct` no-op sans flag / SKU-only avec flag, jamais le stock.

**REVUES OBLIGATOIRES (§11.3)** — diff pipeline POS + OAuth :
- `silent-failure-hunter` : **scope removal SOUND, 0 régression** (aucun endpoint inventory-write appelé ; pas
  de 403 silencieux possible). Findings : #1 LOW (heuristique `"available":` → resserrée à `:\s*-?\d`) corrigé ;
  #3 MED (drop silencieux pushCatalog) corrigé + testé ; #2/#4 LOW différés (garde B couvre déjà l'absence de
  méthode d'écriture ; fetchPromos `[]` lenient = pré-existant intentionnel, hors D6).
- `security-reviewer` : **SOUND** — tokens existants non affectés ; aucun chemin n'exige inventory-write ;
  demander un sous-ensemble est sûr sur les 2 plateformes ; `ITEMS_WRITE`/`write_products` justifiés (pushCatalog).
  Observation (non bloquante) : asymétrie — Shopify `pushCatalog` n'est pas flag-gardé comme Square
  `updatePosProduct` ; si on veut rendre le writeback catalogue opt-in, c'est là. → noté en escalade FYI.

**PREUVE RÉELLE** (méthode §1bis) : chaque garde du test échouerait sur l'état d'AVANT (Square/Shopify auraient
échoué la garde A avant retrait du scope ; le test 422 échouerait sur l'ancien `if(res.ok)` muet). Sorties
inspectées : les corps `pushCatalog` capturés ne portent name/price/EAN, jamais de quantité.

**TESTÉ** : `npm run test:run` → **688/688** (671→688, +17), `tsc` OK. 4 fichiers (2 lib + 1 test + docs).

**ESCALADE (§4, FYI design — pas bloquant)** : `logs/notify-extra.txt` — Shopify `pushCatalog` (création produit
sur validation facture) écrit dans le catalogue POS du marchand SANS flag, contrairement à l'EAN-writeback Square
(flaggé). Garder tel quel (action marchand explicite = valider une facture) ou flag-gater aussi ? Réversible.

**Reste / suivi (vérifiés, anti scope-creep)** : D6 shadow/preview UI (ingest → preview avant publication) =
chantier B visuel → Thomas (pas de navigateur). Invariant read-only sur resync/webhooks non testé en
comportement (garde B couvre déjà l'absence de méthode d'écriture — résiduel documenté). D2 `[G]` reste à
préparer+escalader (tier GTIN-only).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — adapters exercés sur les vrais chemins (getAuthUrl réel, pushCatalog/updatePosProduct avec
  fetch enregistré, corps inspectés), divergence prouvée vs l'état d'avant ; mais unitaire (pas un vrai OAuth
  Square/Shopify ni un vrai marchand). Plafond.
- **Sécurité north-star : 9/10** — 2 revues SOUND ; promesse read-only STOCK durcie AU CONSENTEMENT (le marchand
  ne nous accorde plus l'écriture d'inventaire) + 1 perte silencieuse comblée ; invariant verrouillé par test.
- **Réversibilité : 10/10** — 0 migration, 2 strings de scope + captureError additif + test, revert propre.
- **Discipline de scope : 9/10** — 3 fichiers prod (mêmes 2 fichiers + fix de revue même fichier) + 1 test ;
  D6 marqué partiel honnêtement (UI escaladée) au lieu de sur-construire.
- **Alignement north-star : 9/10** — cœur « ne pas casser sa gestion de stock » prouvé ET renforcé au niveau
  OAuth ; directement pertinent pour la confiance marchand au pilote.
**Objectif (§5bis)** : tests 671→688 ; **2 trous réels** comblés (scopes inventory-write morts ×2 + drop
silencieux pushCatalog Shopify) ; 4 fichiers ; CFR 10 derniers runs : 10/10 `exit=0` avec commit, 0 revert → **100 %**.

---

## 2026-06-23 (run autonome) · PHASE D — **D5 (partiel) `[R]` Gate de match image : fail-open de la vérif corrigé** + décision produit escaladée · commit `4e9be32`

**Sourcing (§6)** : chaîne A + D1/D3/D4/D7 faits ; haut backlog Phase D = **D5** (item `[R]` suivant). Vérifié
dans le code réel d'abord (LESSONS ~70 % faux findings) → **la prémisse de D5 « pas de gate, utiliser CLIP » est
partiellement fausse** : (a) un gate de match d'image EXISTE déjà via `verifyPhotoWithAI` (Haiku vision) dans
`serper.ts` ; (b) le CLIP de `clip-pipeline.ts` est un matching **produit↔produit** (Tier 4 identité), inadapté à
« cette image sourcée matche-t-elle ce NOM » (CLIP image-image exige une image de référence qu'on n'a pas pour un
candidat sourcé) — la vision Haiku (image + texte) est l'outil juste. **Le vrai trou** était ailleurs.

**TROUVÉ (vérifié dans le code, pas supposé) — fail-open silencieux de la vérif image (classe `verifySIRET`)** :
`verifyPhotoWithAI` retournait `true` (= « image matche ») dans 3 cas d'ÉCHEC : clé absente (`!apiKey`),
HTTP `!res.ok`, et `catch`. Conséquence : une erreur de vérif (ou pas de clé) = image acceptée **sans preuve** →
photo potentiellement FAUSSE publiée sur le produit (faux positif visuel + risque de rejet Google). Or
**`ANTHROPIC_API_KEY` est ABSENTE en prod** (priorities §3 Rang 4) → en prod, **100 % des images Serper sont
publiées sans aucune vérif de contenu**. Callers (6 sites d'enrichissement) écrivent `photo_url` sur le produit ;
`searchSerperImages` fait `if (!aiMatch) continue` → un `false` écarte le candidat (essaie le suivant).

**FAIT (réversible, 0 migration)** — `src/lib/images/serper.ts` :
- **Vérif ON + erreur** (HTTP !ok / timeout / throw) → désormais `false` (candidat écarté, ≠ accepté à
  l'aveugle) + `captureError` → VISIBLE. Best-effort : si tous les candidats échouent, aucune image ce run,
  re-tentée au prochain cycle d'enrich (`photo_url` reste null = pas de flag « tried » qui figerait → vérifié
  par la revue : auto-guérison SOUND).
- **Vérif OFF** (clé absente, mode prod actuel) → garde `true` (compat, on ne strippe pas unilatéralement
  toutes les images prod) MAIS rendu OBSERVABLE via `captureError` **une seule fois/process** (flag module
  `warnedVerifierDisabled`, anti-flood) → Thomas voit enfin « images publiées sans vérif ».
- Bonus même thème (revue) : les erreurs **niveau Serper** (`!res.ok` + catch de `searchSerperImages`) passaient
  en `console.warn` (Sentry-invisible) → `captureError` : une panne Serper = plus d'images, désormais visible.
  (`verifyImageUrl` HEAD-check laissé en skip silencieux : un candidat URL mort est bénin/fréquent, captureError
  y floodrait — décision justifiée, pas complaisance.)

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff = surface enrichissement/publication d'image) : **SOUND** sur
le diff (aucun nouveau silent-failure ; guard one-time correct ; pas de flag « tried » → retry naturel via
`photo_url IS NULL` confirmé sur les 6 callers ; pas de fuite `clearTimeout`). Les 2 `console.warn` Serper
qu'elle a relevés (BASSE, pré-existants) ont été corrigés ci-dessus.

**PREUVE RÉELLE** (méthode §1bis) : `tests/images-verify-photo.test.ts` (+5) drive `verifyPhotoWithAI` exporté,
fetch + `@/lib/error` mockés : « oui »→accepté/0 erreur ; « non »→refusé/0 erreur (no-match légitime ≠ panne) ;
**HTTP 529→false + captureError** ; **throw→false + captureError** ; **clé absente→true MAIS captureError 1×
sur 2 appels** (anti-flood prouvé) + fetch jamais appelé sans clé. Chaque assertion d'erreur échouerait sur
l'ancien code (`return true`).

**TESTÉ** : `npm run test:run` → **671/671** (666→671, +5), `tsc` OK. 3 fichiers (1 lib + 1 test + docs).

**ESCALADE (§4, décision produit/dépense)** : `logs/notify-extra.txt` — A) ajouter `ANTHROPIC_API_KEY` prod
(Haiku vérifie, ~0,001 $/img) [reco] vs B) bloquer images non vérifiées vs C) garder l'acceptation non vérifiée
+ tracer. Le software est prêt+testé pour les 3 ; seul le GO est à Thomas. **D5 marqué partiel** (le gate est
durci+observable ; le choix de politique en prod reste ouvert).

**Reste / suivi (vérifiés réels, anti scope-creep)** : (D4-suite) images anti-rejet GRATUITES OBF/OPF jetées
(`photo_url:null`) → arbitrer la SOURCE-image avec ce choix A/B/C (produit). (revue BASSE) `verifyImageUrl`
catch silencieux laissé volontairement (bruit HEAD). D6 (shadow/preview + invariant read-only POS) non entamé.

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car synthétique, pas vrai marchand)
- **Preuve : 7/10** — `verifyPhotoWithAI` exercé sur les 5 modes (match/no-match/HTTP-err/throw/no-key) avec
  divergence prouvée vs l'ancien code ; mais testé unitairement (pas le chemin intégré `searchProductImage` ni
  un vrai appel Haiku/Serper). Plafond.
- **Sécurité north-star : 8/10** — revue SF-hunter SOUND, fail-open d'une vérif (= publier une image sans preuve)
  fermé ; mode dégradé prod rendu visible ; aucune nouvelle perte silencieuse.
- **Réversibilité : 10/10** — 0 migration, additif (export + garde-fous d'erreur), revert propre.
- **Discipline de scope : 9/10** — 1 fichier prod ciblé + 1 test ; correctifs de revue (même fichier/thème)
  inclus, findings hors-thème différés ; D5 marqué partiel honnêtement au lieu de sur-implémenter.
- **Alignement north-star : 8/10** — cœur « zéro faux positif visuel » + observabilité du mode dégradé prod ;
  borné par le fait que le levier majeur (clé prod) est une décision Thomas (escaladée).
**Objectif (§5bis)** : tests 666→671 ; **1 fail-open réel** comblé (vérif image) + 2 `console.warn` Serper rendus
Sentry-visibles ; 3 fichiers ; CFR 10 derniers runs : 10/10 `exit=0` avec commit (ledger), 0 revert → **100 %**.

---

## 2026-06-23 (run autonome) · PHASE D — **D7 `[R]` Concordance EAN↔nom-marchand** PROUVÉ + **D4 vérifié déjà-fait/retiré** · commit `2887263`

**Sourcing (§6)** : backlog Phase D, item `[R]` de plus haut rang non terminé = D4. **Vérifié dans le code
réel d'abord** (LESSONS ~70 % de faux findings) → **D4 est caduc** : Open Beauty Facts est DÉJÀ entièrement
câblé dans la cascade (`fetchFromOpenBeautyFacts`, reverse-search, `collectAllEanSources` → `tier2_obf` 0.97,
appelé par `fetchEanData`/`runCascade`) et « pas d'API GS1 payante » déjà respecté (`lookupGs1` inerte sans
clé, tier Basic 0€). Retiré du backlog (§5, zéro complaisance — ne pas fabriquer du busywork). En vérifiant,
trou réel central au north-star repéré → **D7** (item `[R]` suivant), traité ce run.

**TROUVÉ (vérifié dans le code, pas supposé) — faux positif d'identité, chemin forward non gardé** :
`runCascade` (`cascade-engine.ts`), quand le marchand fournit un EAN, fait `collectAllEanSources(ean)` → un
seul tier OBF/EAN-Search qui matche le code-barres pousse `tier2_obf` (0.97) → `buildCascadeOutcome` → score
≥0.95 → `validated`+`visible:true` = **AUTO-PUBLISH, SANS jamais vérifier que le nom résolu concorde avec le
nom saisi par le marchand**. Le chemin **reverse** (nom→EAN) a `verifyEanMatchWithAI` (`pickBestCandidate`),
mais le chemin **forward** (EAN→nom) n'avait AUCUN croisement → un EAN mal saisi ou réutilisé (barcode reuse)
résout une identité RÉELLE mais FAUSSE et la publie. C'est exactement « ne faire confiance à AUCUNE source
seule » (north-star « zéro faux positif »). Consommateur réel : `enrichOneProduct` applique `outcome.visible`/
`review_status` au produit (chemin EAN déclaré = `eanGuessed=false` → `outcome.visible` brut = le trou).

**FAIT (réversible, 0 migration)** :
- `score-cascade.ts` : `buildCascadeOutcome(..., opts?: { identityConcords })` — si `=== false` ET status
  dérivé `validated` → rétrograde `pending`/`visible:false` (**downgrade-only**, jamais l'inverse ; rétro-
  compatible : `undefined`/`true` = comportement historique ; **score brut préservé** pour `identification_score`).
- `cascade-engine.ts` : helper pur `evalIdentityConcordance(merchantName, resolvedName, brand)` =
  `scoreNameMatch(...) ≥ IDENTITY_CONCORDANCE_THRESHOLD (0.25)` (réutilise la fonction existante = source
  unique de matching de noms). Seuil conservateur : divergence claire (~0-0.2) → review ; nom terse cohérent
  (recouvrement de mots, poids 60 %) → reste validated. Appliqué aux **DEUX points de sortie**.

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff pipeline identité = gate de publication) :
- **CRITIQUE-1 retenu+corrigé** : l'early-return CIP médicament contournait la garde → un CIP mal saisi mais
  valide+présent dans BDPM s'auto-publiait en 0.99 (le cas le plus dangereux). Garde appliquée aussi sur CIP
  (helper aux 2 returns). +2 tests (CIP mismatch→pending, CIP concordant→validated).
- **HAUTE-1 réfuté par calcul** (« asymétrie brand → faux downgrade ») : le brand est préfixé sur l'ORIGINAL
  (le rallonge vers le candidat → aide levScore), et `overlapScore` (60 %) est symétrique ; leur exemple
  "Air Force 1"/"Nike Air Force 1 Retro" donne **0.89**, pas 0.22. Test terse "Crème hydratante" le prouve.
- **HAUTE-3 retenu** : +1 test convergence 2 tiers + nom long divergent → pending malgré 0.985.
- **CRITIQUE-2** (GS1 sans nom → garde inerte) : limitation réelle mais `lookupGs1` inerte en prod (pas de
  clé) + over-gater une source autoritative sans nom = friction → documenté (`undefined`=non évaluable), non
  corrigé. **HAUTE-2 / MOYENNE-1/2/3 / BASSE-1** : pré-existants, orthogonaux à D7, impact borné (eanGuessed
  plafonne déjà à pending ; tiers best-effort) → différés, listés ci-dessous.

**PREUVE RÉELLE** (méthode §1bis) : `cascade-engine.test.ts` (chemin réel `runCascade`, faux multi-source +
vrai `scoreNameMatch`) + `score-cascade.test.ts` (garde pure). +12 tests : mismatch→pending malgré
0.97/0.985/0.99 ; concordant→validated ; terse-cohérent→validated ; CIP mismatch/concordant ; convergence
mismatch ; nom marchand absent→inerte ; canonicalName null→inerte (score décide). Chaque assertion échouerait
sur l'ancien code (la mismatch aurait été `validated`/`visible`).

**TESTÉ** : `npm run test:run` → **666/666** (était 654, +12), `tsc` OK. `detect_changes` MCP gitnexus
indisponible dans l'env → périmètre confirmé par git : 2 fichiers prod (additif/interne) + 3 tests.

**MÉTRIQUE** : 2 items Phase D traités (D4 vérifié caduc/retiré ; D7 prouvé). **1 faux positif d'identité
réel comblé** (forward EAN→nom non gardé) + **1 CRITIQUE de revue corrigé** (CIP). 5 fichiers (2 lib + 3 test ;
+3 docs). 0 migration, réversible. Aucune escalade (tout réversible).

**Reste / suivi non bloquant (vérifiés réels, pour run futur — anti scope-creep ce run)** :
- (D4-suite) **Images anti-rejet GRATUITES** : `fetchFromOpenBeautyFacts`/`OpenProductsFacts` jettent
  l'image OBF/OPF (GTIN-keyée, gratuite) → arbitrer la SOURCE-image avec D5 (gate CLIP), décision préférence
  Serper vs OBF = produit (ne pas trancher en solo).
- (HAUTE-2) `enrich-product.ts:62` `.update({ean:foundEan})` non vérifié → si l'écriture échoue, runCascade
  tourne sur EAN null (impact borné : `eanGuessed=true` plafonne déjà à pending).
- (MOYENNE-1) `canonical_name` non persisté dans `enrichOneProduct` (traçabilité du pourquoi-pending).
- (MOYENNE-2/BASSE-1) Tier 3 GPC / Tier 4 CLIP : erreurs swallowed `NODE_ENV==='development'`-only en prod.

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car prouvé synthétique, pas vrai marchand)
- **Preuve : 8/10** — chemin réel `runCascade` exercé sur mismatch/concordance/CIP/convergence, divergence
  prouvée vs l'ancien code. Plafond 8 (pas de vrai marchand/EAN réel live).
- **Sécurité north-star : 8/10** — revue SF-hunter, CRITIQUE-1 corrigé, faux positif d'identité (publier une
  identité fausse en confiance d'une source) fermé sur les 2 chemins ; downgrade-only (aucun nouveau risque).
- **Réversibilité : 10/10** — 0 migration, additif (param optionnel + garde downgrade-only), revert propre.
- **Discipline de scope : 9/10** — 1 unité (D7) + correctif de revue ; 2 fichiers prod ; findings pré-existants
  différés au lieu d'élargir le diff ; D4 retiré au lieu de fabriquer du busywork.
- **Alignement north-star : 9/10** — cœur « zéro faux positif » : on ne fait plus confiance à une seule source
  pour publier une identité ; le pilote ne verra pas un produit faussement identifié auto-publié.
**Objectif (§5bis)** : tests 654→666 ; **1 faux positif d'identité + 1 CRITIQUE de revue** comblés ; 5 fichiers ;
CFR 10 derniers runs : 10/10 `exit=0` avec commit (ledger), 0 revert détecté → **100 %**.

---

## 2026-06-23 (run autonome) · PHASE D — item **D3 `[R]` Métrique « % publiable » (KPI pilote)** PROUVÉ · commit `beb8826`

**Sourcing (§6)** : chaîne A 1→8 + D1 faits ; haut du backlog Phase D = D2 `[G]` (escaladé), donc item
`[R]` de plus haut rang non terminé = **D3**. D1 avait explicitement renvoyé à D3 l'observabilité
« combien filtrés par cause ». Vérifié dans le code réel (LESSONS ~70 % faux findings) → le KPI EXISTE
déjà (`/api/google/stats` + `dashboard/google/page.tsx`) mais **ment**.

**TROUVÉ (vérifié dans le code, pas supposé)** — faux positif du KPI, même classe que maillon 7 / store_code :
1. `/api/google/stats` calculait `eligible_google = ean && price !== null` → comptait « éligibles » des
   produits **SANS image, au prix 0, au GTIN tronqué (<8)** que le vrai gate du feed (`isFeedEligible`,
   D1) rejette en silence. La page affiche « X produits seront visibles immédiatement sur Google » → le
   pilote aurait cru ~100 % alors que la moitié est bloquée par l'image (la cause D3 explicite).
2. La population était `visible=true` **SEULEMENT**, alors que les 2 feeds exigent aussi
   `validated + archived_at IS NULL + variant_of IS NULL`. `archive_product` (068) met `archived_at`
   sans toucher `visible` → un produit archivé resté visible était compté publiable (même bug exact que
   maillon 7, surface KPI cette fois).
3. La lecture produits **avalait son `error`** (`const { data: products } = …`) → un blip DB renvoyait
   un KPI **all-zeros** (faux « catalogue vide / 0 % publiable ») en silence sur la page Google.

**FAIT (réversible, 0 migration)** :
- Helper pur **`summarizePublishability(rows)`** (`feed-eligibility.ts`) **réutilise le VRAI gate** :
  3 prédicats par dimension (`hasPublishableGtin`/`hasPublishablePrice`/`hasImage`) que `isFeedEligible`
  ET le KPI partagent → le KPI ne peut PAS diverger du feed (source unique, leçon store_code/honestSalePrice).
  `isFeedEligible` refactoré pour les composer = **comportement strictement identique** (vérifié + revue).
  Renvoie `total/publishable/missing_ean/missing_price/missing_image/blocked_only_by_image/score`.
  `blocked_only_by_image` (EAN+prix OK, image seule manquante) = cible actionnable directe du sourcing
  image (D2/D5).
- Route réécrite : population alignée **EXACTEMENT** sur le gate des 2 feeds, `eligible_google`/`score`
  = `isFeedEligible`, **champ additif** `blocked_only_by_image` (contrat client inchangé, dashboard lit
  les mêmes clés). Read produits + lookup marchand : erreur → **500+captureError** (≠ PGRST116 = 403),
  null-sans-erreur → 500 (état SDK inattendu, parité défensive avec cron/google-feed).

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff = surface KPI/observabilité feed) : **SOUND** — refactor
`isFeedEligible` prouvé identique clause par clause ; population KPI == population des 2 feeds (table de
parité) ; read-error→500 au lieu d'all-zeros. Findings restants LOW/pré-existants (titre Sentry
`[object Object]` systémique ; LFP route Voie B sans captureError = hors scope, non touché). 1 amélioration
appliquée suite revue : `products` null-sans-erreur → 500 (au lieu d'un KPI vide trompeur).

**PREUVE RÉELLE** (méthode §1bis) : `tests/lib/google/publishability.test.ts` (+10). (a) fonction pure sur
**catalogue SALE mixte** (9 produits) inspecté champ par champ : publishable 2, missing_ean 3 (null+tronqué
+cumul), missing_price 2 (0+null), missing_image 3, blocked_only_by_image 2, score 22 % ; invariant
`publishable == count(isFeedEligible)`. (b) chemin réel route : sans-image NON éligibilisé (l'ancien proxy
le faisait), archivé/variante/non-validé **hors population** (parité feed), read-error→500+Sentry,
lookup-marchand-error≠PGRST116→500, PGRST116→403 sans Sentry, non-auth→401. Chaque assertion échouerait
sur l'ancien code.

**TESTÉ** : `npm run test:run` → **654/654** (était 644, +10), `tsc` OK.

**MÉTRIQUE** : 1 item `[R]` Phase D fermé (D3). **1 faux positif KPI réel comblé** (le KPI pilote mentait :
sur-évaluation publiabilité + ignore image/archivé) + **1 silent-failure réel fermé** (read all-zeros).
4 fichiers code/test (1 lib + 1 route + 1 test ; + 3 docs). 0 migration, réversible. Aucune escalade.

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car prouvé synthétique, pas vrai marchand)
- **Preuve : 8/10** — KPI réel des 2 surfaces inspecté champ par champ sur catalogue sale + chemin réel route
  (6 facettes). Plafond 8 (pas de vrai marchand/feed Google live).
- **Sécurité north-star : 8/10** — revue SF-hunter SOUND, fin d'un faux positif affiché au pilote + d'un
  silent-failure de lecture ; parité KPI↔feed garantie par helper unique. Aucun nouveau risque introduit.
- **Réversibilité : 10/10** — 0 migration, additif (champ optionnel + refactor iso-comportement), revert propre.
- **Discipline de scope : 9/10** — 1 unité ciblée (D3), 3 fichiers code/test ; visibilité/validation non
  étendues au-delà de la parité feed (anti scope-creep).
- **Alignement north-star : 9/10** — le KPI du pilote dit enfin la VÉRITÉ du feed (« afficher honnêtement,
  zéro faux positif ») et pointe la cause actionnable n°1 (manque image) pour D2/D5.
**Objectif (§5bis)** : tests 644→654 ; **1 faux positif KPI + 1 silent-failure** comblés ; 4 fichiers ;
CFR 10 derniers runs : 10/10 `exit=0` avec commit (ledger), 0 revert détecté → **100 %**.

---

## 2026-06-23 (run autonome) · PHASE D — item **D1 `[R]` Audit complétude feed Google + `g:sale_price`** PROUVÉ · commit `ecfbd9b`

**Sourcing (§6)** : chaîne A 1→8 COMPLÈTE → Phase D (cerveau priorities.md). Item `[R]` de plus haut
rang non terminé = **D1**. Trou identifié explicitement par le plan : les **promos ne remontaient sur
AUCUN canal Google** (Voie A `feed.ts` Content API ni Voie B `lfp-xml.ts` XML crawlé).

**TROUVÉ (vérifié dans le code réel, pas supposé)** :
1. Ni `transformProductToGoogle` (Voie A) ni `buildItemXml` (Voie B) n'émettaient `sale_price` — un
   marchand qui crée une promo (`/promotions`, table `promotions{sale_price,starts_at,ends_at}`) la voit
   sur l'app/feed consumer (maillon 6 `honestSalePrice`) mais **JAMAIS sur Google**. Manque à gagner +
   incohérence prix Google vs vitrine.
2. **Divergence d'éligibilité Voie A/B** (même classe que `store_code` maillon 7) : `filterEligibleProducts`
   (A) acceptait `price=0` et un EAN tronqué que `filterFeedEligible` (B) rejetait (`price>0`,
   `ean.length>=8`) → les 2 canaux vers le MÊME tiers émettaient des **ensembles différents**.

**FAIT (réversible, 0 migration)** :
- Helper pur **`activeFeedSalePrice(price, promotions, nowMs)`** (`src/lib/products/sale-price.ts`) :
  réutilise `honestSalePrice` (source unique « vrai rabais » `< prix courant`) + filtre **promo active**
  (fenêtre `starts_at`/`ends_at`, bornes inclusives) + **meilleur rabais** si plusieurs. **Pas de
  `sale_price_effective_date`** (feed = état courant, re-push 3h/re-crawl 15 min, comme `availability`).
- Voie A : `transformProductToGoogle` émet `salePrice {value,currency}` ; Voie B : `<g:sale_price>X EUR</g:sale_price>`
  placé juste après `<g:price>`. Les 2 voies SELECT désormais `promotions(sale_price,starts_at,ends_at)`.
- **Parité fermée** : prédicat partagé **`isFeedEligible`** (`src/lib/google/feed-eligibility.ts`) délégué
  par les 2 filtres ; `nowMs` capturé **une fois par feed** (cohérence intra-feed, suite revue).

**REVUE OBLIGATOIRE `silent-failure-hunter`** (diff = canal sortie pipeline) : north-star **SOUND** —
le faux positif « promo non-rabais / hors fenêtre poussée à Google » est bloqué par 3 gardes composées
(write `/promotions` + fenêtre active + `honestSalePrice` au read-feed). Findings traités : MED `nowMs`
par-produit dans la boucle cron → **capturé une fois** (corrigé) ; MED observabilité « filtrés par cause »
→ **renvoyé à D3** (KPI dédié, anti-duplication + anti Sentry-flood) ; LOW timestamp corrompu → **moot**
(`starts_at timestamptz NOT NULL DEFAULT now()`, `ends_at` nullable timestamptz → PostgREST renvoie
toujours de l'ISO valide, vérifié migration 001) ; LOW borne inclusive → commentée.

**PREUVE RÉELLE** (méthode §1bis — feed généré sur fixture promo active 99.99 / prix 129.99, **inspecté
champ par champ**) : les 2 voies émettent le MÊME ensemble + le prix promo — Voie A
`"salePrice":{"value":"99.99","currency":"EUR"}`, Voie B `<g:sale_price>99.99 EUR</g:sale_price>`.
Couvert par `tests/lib/google/feed.test.ts` + `lfp-xml.test.ts` : promo active émise / expirée omise /
future omise / non-avantageuse omise / multi → meilleur rabais ; parité `price=0` + EAN court rejetés A.
Matrice champ-à-champ + spec Google : `docs/prospection/google-lfp-feed-audit.md` (section D1).

**TESTÉ** : `npm run test:run` → **644/644** (était 632, +12 nets ; +18 cas feed/lfp), `tsc` OK.

**MÉTRIQUE** : 1 item `[R]` Phase D fermé (D1). **1 trou produit réel comblé** (promos→Google) +
**1 divergence de canaux réelle fermée** (éligibilité A/B). 7 fichiers touchés (2 libs + 1 lib neuve +
2 routes + 2 tests ; + 3 docs). 0 migration, réversible. Aucune escalade (tout réversible).

### 5bis. SCORECARD (auto-évaluation honnête /10 — plafond 8 car prouvé synthétique, pas vrai marchand)
- **Preuve : 8/10** — sortie RÉELLE des 2 feeds inspectée champ par champ sur fixture promo active +
  6 facettes de la règle d'émission testées. Plafond 8 (pas de vrai marchand/feed Google live).
- **Sécurité north-star : 8/10** — revue SF-hunter SOUND, 3 gardes composées contre le faux rabais→Google,
  parity de canaux fermée. Aucune perte/faux positif introduit ; finding nowMs corrigé.
- **Réversibilité : 10/10** — 0 migration, pur additif (champ optionnel + params défaut), `git revert` propre.
- **Discipline de scope : 9/10** — 1 unité ciblée (D1), 7 fichiers code/test cohérents, observabilité
  renvoyée à D3 plutôt qu'élargir le diff.
- **Alignement north-star : 9/10** — avance directement « compatible Google + prêt pilote » (Phase D) :
  les promos marchand atteignent enfin Google, honnêtement.
**Objectif (§5bis)** : tests 632→644 ; **2 trous réels** comblés (promo feed + divergence éligibilité) ;
7 fichiers ; CFR 10 derniers runs : 10/10 `exit=0` avec commit (ledger), 0 revert détecté → **100 %**.

---

## 2026-06-22 (run autonome) · Rang 3 [R] — **Hot path facture→catalogue/stock (`POST invoices/[id]/validate`) durci : 7 pertes silencieuses réelles fermées + 1er test du chemin** · commit `<à compléter>`

**Sourcing (§6)** : chaîne A 1→8 COMPLÈTE, haut du backlog [G]/[X] → couverture hot path manquante.
Trouvé que la route `validate` (CRÉE produits + ÉCRIT stock `source:"invoice"` = marchandise reçue)
n'avait **AUCUN test** et portait plusieurs pertes silencieuses, toutes du motif déjà connu (maillons 2/8 :
`const { data } = …` qui avale `error` → vide indistinct d'échec → perte/écrasement silencieux).

**TROUVÉ + CORRIGÉ (vérifié dans le code réel, 0 migration, réversible)** :
1. **Insert produit avalé** (`insertErr` destructuré mais `console.log` dev-only) → un produit de facture
   qui échoue à l'insert était DROPPÉ en silence (0 stock, 0 lien, 0 compteur) alors que la facture
   finissait « validée ». → branche `else` : `captureError` + `errors[]`.
2. **Lecture `currentStock` avalée** (exact match) → `data=null` indistinct de « pas de stock » → l'upsert
   ÉCRASAIT la qté réelle existante par la seule qté facture (read-modify-write corrompu = perte de stock).
   → sur erreur : `captureError` + **skip de l'upsert** (préservation), jamais d'écrasement.
3. **Lecture `available_sizes` avalée** (×2 : exact match + branche même-batch) → même écrasement, mais des
   **tailles** réelles par la liste partielle de la facture. → sur erreur : préservation + Sentry.
4. **Inserts/upserts stock non vérifiés** (création + match + `stock_incoming`) → `stock_updated` comptait
   des écritures en échec (faux succès). → comptage **par succès réel** + `captureError` par échec.
5. **MAJ statut facture non vérifiée** → 200 « validée » mais statut périmé en base (et re-validate jamais
   déclenché). → `captureError` + `errors[]`.
6. **`catch {}` global sans `captureError`** → tout crash de ce hot path invisible en prod. → `captureError`.

**REVUE OBLIGATOIRE** `silent-failure-hunter` (diff pipeline) : mes 4 premiers fixes jugés **SOUND**
(capture-and-continue correct : re-validate re-converge sans double-comptage car l'écriture en échec n'a PAS
eu lieu — vérifié branche par branche). A surfacé 3 HIGH adjacents du MÊME motif (available_sizes ×2 +
statut facture) → **tous corrigés dans le run**. Findings LOW (feed_events, lectures merchant/invoice→404)
laissés (observabilité, 0 perte data, anti scope-creep).

**PREUVE RÉELLE** (`tests/invoice-validate-writes.test.ts`, +8) : on drive la VRAIE route POST avec un faux
client Supabase **qui enregistre les écritures** et permet d'INJECTER des erreurs ciblées. Couvre : happy
path (stock écrit `source:invoice`) ; insert produit échoué → pas de drop (captureError + errors, 0 stock
fantôme) ; exact match → stock **ajouté** (5+3=8, pas écrasé par 3) ; lecture stock échouée → pas de wipe ;
insert stock création échoué → non compté + Sentry ; lecture available_sizes échouée → tailles préservées ;
MAJ statut échouée → erreur visible ; crash → captureError + 500. Chaque assertion échouerait sur l'ancien code.

**TESTÉ** : `npm run test:run` → **632/632** vert (était 624, +8), `tsc` OK.

**MÉTRIQUE** : 1 hot path d'écriture stock majeur (facture) passe de **0 test + 7 pertes silencieuses** à
**prouvé + durci**. Couverture des chemins critiques (métrique-garde-fou) qui MONTE. Aucune escalade (tout
réversible, 0 migration). **Reste / suivi non bloquant** (vérifiés réels, pour run futur, pas dans ce diff) :
re-validate d'une facture déjà « validated » N'EST PAS idempotent sur le stock (read-modify-write add) → un
double-validate double-compte (pré-existant, orthogonal au silent-failure ; gate UI = passage en `imported`
bloque, mais `validated` re-validatable) ; feed_events inserts non vérifiés (visibilité consumer, LOW).

---

## 2026-06-22 (run autonome) · Rang 3 [R] — **Vérif SIRET honnête** (fin du faux positif « vérifié » silencieux) + 3 silent-failures · commit `4a03ca4`

**Sourcing (§6)** : chaîne A 1→8 COMPLÈTE → sourcing par signaux sur le backlog Rang 3 `[R]`.
Item choisi : « **SIRET non-diffusible : `verify-siret` échoue en silence → message onboarding
dédié** ». Vérifié dans le code réel (LESSONS ~70 % faux findings) → le trou est **plus profond
que noté** : 3 silent-failures composés sur la porte d'entrée de l'onboarding marchand.

**TROUVÉ (vérifié dans le code, pas supposé)** :
1. `verifySIRET` **fail-open en `valid:true` SANS signal** dans 3 cas — token INSEE absent (**le cas
   PROD aujourd'hui**, INSEE_API_TOKEN non posé), HTTP non-OK (401 expiré/429/5xx), throw réseau.
   Le caller ne pouvait pas distinguer « vérifié INSEE » de « passé sans contrôle ».
2. La route renvoie `valid:false` au **statut 400**, mais les **2 forms** (`devenir-marchand`,
   `auth/signup`) testaient `res.status === 404` → la branche était **morte** → un SIRET introuvable
   ou fermé **tombait en SILENCE à l'étape profil** (le blocage « introuvable » ne s'est jamais
   déclenché).
3. La route n'émettait **NI `company` NI `pending`** que les forms consomment pourtant
   (`data.company` → pré-remplissage du profil ; `data.pending` → `merchant_siret_pending` →
   `create-merchant-from-metadata:57` `status: pending|active`). Conséquence concrète : en prod
   (sans token) **100 % des marchands self-signup étaient créés `status:"active"` (confiance pleine)
   sans AUCUNE vérification** — toute la machinerie « pending » (message ambre, dashboard lecture
   seule) était câblée de bout en bout mais le signal ne circulait JAMAIS.

**DÉCIDÉ + FAIT (réversible, 0 migration)** :
- `src/lib/siret.ts` : contrat honnête avec `pending`. Non vérifié = `valid:true, pending:true`
  (le marchand passe — fail-open assumé, on ne bloque pas l'onboarding — MAIS son compte est marqué
  en attente). Token absent = config attendue → **pas** de Sentry ; 401/5xx/réseau/200-sans-
  établissement → **captureError** (rendus VISIBLES). Parse INSEE **gardé** (plus de TypeError sur
  payload partiel) + **sanitisation `[ND]`** (établissements non-diffusibles → champs `null`, pas de
  crash ni de « [ND] » affiché — c'était le cœur de l'item « non-diffusible »).
- route `verify-siret` : renvoie `{valid, pending, company:{...}|null}` + garde `typeof siret`.
- 2 forms : `!res.ok` bloque avec `data.error` (le check `===404` était mort).

**REVUES OBLIGATOIRES** (auth + pipeline silent-failure) :
- **silent-failure-hunter** : aucun chemin `valid:true,pending:false` sans vérif réelle ; `pending`
  propagé correctement (signup → metadata → create-merchant) ; discrimination config/erreur correcte ;
  pas de nouveau TypeError. **2 findings adjacents corrigés** dans le run : (MED) le `catch` des 2 forms
  avalait l'erreur réseau/JSON → `captureError` ; (LOW) `create-merchant-from-metadata:60` avalait
  l'erreur d'insert (marchand inscrit SANS ligne `merchants`, mais redirigé `/dashboard` = succès) →
  `captureError`.
- **security-reviewer** : pas de fuite token (contexte Sentry = `siret/status/phase` uniquement) ;
  SIRET validé `^\d{14}$` avant l'URL INSEE (pas de SSRF/path-injection) ; `pending=false` non
  forgeable via le SIRET (URL INSEE hardcodée). **ESCALADE posée** (notify-extra) : `status:"active"`
  dérivé de `user_metadata` **client-writable** (pré-existant ; impact **borné** : `status` ne gate PAS
  la visibilité produit consumer — gate produit `visible+validated+!archived` séparé, cf. maillon 7 —
  seulement la file de revue admin) = décision **produit** (toujours-pending vs vérif serveur).

**TESTÉ** : `tests/siret.test.ts` (+12) drive le **vrai `verifySIRET`** (fixtures INSEE
diffusible/non-diffusible/fermé/404/401/réseau/200-sans-établissement) **ET la vraie route POST**
(contrat `company`/`pending`, 400 introuvable). `npm run test:run` → **624/624** vert (était 612, +12),
`tsc` OK, pre-push vert, poussé.

**MÉTRIQUE** : 1 item `[R]` fermé (SIRET honnête) + 3 silent-failures réels corrigés. Net : un faux
positif de confiance qui touchait **100 % des marchands en prod** est supprimé ; la perte silencieuse
n°1 du canal onboarding (email/inscription) est rendue visible. **Reste** : escalade trust-gate (binaire,
notify-extra) ; notes sécu non bloquantes (x-forwarded-for spoofable + Sentry flooding, pré-existants
app-wide ; SIRET non format-validé dans `/api/merchants`) consignées ci-dessous pour un run futur.

**Notes sécu non bloquantes (pré-existantes, pour run futur — vérifiées réelles)** :
- `x-forwarded-for` utilisé tel quel comme clé de rate-limit (toutes les routes) → spoofable derrière
  proxy ; + `captureError` par échec INSEE → risque de flooding Sentry pendant une panne INSEE.
  Cross-cutting (pas propre à ce diff) → à traiter globalement, pas ici.
- `/api/merchants` POST n'applique pas `^\d{14}$` sur le `siret` avant insert (borné : statut toujours
  `pending` sur cette route).

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 8 (Canal EMAIL-IN stock, de bout en bout) — PROUVÉ + 2 silent-failures réels corrigés → **CHAÎNE A 1→8 COMPLÈTE**

**Sourcing** : mission §1bis, dernier maillon `⬜` de la chaîne A = maillon 8 (email-in : la PORTE
des POS FR Clictill/Fastmag qui émaillent un CSV vers `stock-{slug}@twostep.fr`, ADR-002). Les
sous-pièces (`parseInboundAddress`, `ingestStockFileForMerchant`) étaient testées ISOLÉMENT
(`inbound-address.test.ts`, `ingest-stock-file.test.ts`) mais l'**ORCHESTRATION** de la route
`POST /api/inbound-email` (signature Resend → routage canal → résolution marchand → contrat
snapshot-unique → décodage base64 → câblage ingestion) n'avait **AUCUN test** — exactement le motif
maillons 5/6/7 (l'invariant vit dans l'orchestration, pas dans une fonction pure).

**TROUVÉ + CORRIGÉ — bug réel n°1 (faux négatif de résolution = perte silencieuse n°1)** : la
résolution `merchants.inbound_email_slug` AVALAIT son `error` (`const { data: merchant } = ...`). Un
blip DB → `merchant=null` → `resolved=null` → `200 OK "no matching merchant"` → **Resend ne réessaie
JAMAIS** → l'email stock planifié du marchand est PERDU EN SILENCE (feed figé, 0 Sentry, 0 statut).
Même classe que `resolveWebhookProduct` (erreur DB ≠ « marchand inconnu »). **FIX** : retenir
l'erreur ; si rien ne matche ET erreur DB → `captureError` + **500** (Resend retry) ; un slug
réellement inconnu (spam) reste un **200 bénin** (ne pas faire boucler Resend). TDD : test RED prouvé
sur l'ancien code (`git stash` du route → le test « erreur DB » échoue), GREEN après fix.

**TROUVÉ + CORRIGÉ — bug réel n°2 (revue silent-failure-hunter, MEDIUM, même hot path)** :
`resend.emails.get(emailId)` peut renvoyer `{data:null, error}` sur un blip API → `attachments=[]` →
le canal stock conclut « pas de pièce jointe tableur » + **200** → un email stock qui CONTENAIT
pourtant son CSV est dropé, jamais réessayé, et l'alerte Sentry **MISDIAGNOSTIQUE** « no attachment »
au lieu de « fetch échoué ». **FIX** : vérifier `emailRes.error || !emailRes.data` → **throw** →
outer catch → `captureError` + 500 → Resend RÉESSAIE. Distingue « fetch raté » (retry) de « email
sans tableur » (200 bénin légitime). +1 test.

**REVUE OBLIGATOIRE** `silent-failure-hunter` (diff pipeline ingest) : fix n°1 jugé **SOUND**
(discrimination erreur-DB/no-match correcte, pas de boucle 500 sur spam, pas de double-ingestion : le
500 est PRÉ-ingestion + `ingestStockFileForMerchant` hash-idempotent). A surfacé le finding n°2
(MEDIUM, corrigé dans le run). Findings B/C (LOW) = enrichissement de contexte Sentry sur des chemins
qui remontent DÉJÀ 500+captureError (pas de perte) → laissés (anti scope-creep).

**PREUVE RÉELLE** (`tests/ingest-maillon8-email-in.test.ts`, +10) : on drive la VRAIE route POST avec
un payload Resend `email.received` réaliste signé HMAC + une pièce jointe **CSV FR sale réelle**
(séparateur `;`, accents, en-tête « Quantité ») encodée base64. Couvre : signature invalide→401 ;
type≠received→200 ; **erreur DB résolution→500+captureError** ; slug inconnu→200 sans Sentry ;
**décodage base64 SANS PERTE** (le buffer reçu par l'ingestion == le CSV d'origine octet pour octet) ;
**erreur Resend fetch→500** ; canal stock sans tableur→captureError ; **multi-fichiers→snapshot-unique
(captureError + 0 ingestion)** ; ingestion non aboutie (no_exploitable)→captureError ; unchanged→bénin.

**TESTÉ** : `npm run test:run` → **612/612** vert (était 602, +10), `tsc` OK.

**MÉTRIQUE** : maillon 8 (Email-in) **prouvé COMPLET** + 2 silent-failures réels corrigés → **la
CHAÎNE DATA A (1 parse → 2 triage → 3 match → 4 reconcile → 5 confiance → 6 affichage read-path →
7 sortie Google → 8 email-in) EST PROUVÉE MAILLON PAR MAILLON DE BOUT EN BOUT.** Aucune escalade de
décision binaire (tout réversible, 0 migration). **Reste** : plan B (validation VISUELLE de l'UI au
navigateur — maillon 6 visuel) = hors périmètre boucle, escaladé à Thomas ; items `[G]`/`[X]` du
backlog inchangés.

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 7 (Sortie Google LFP — gate honnête) — PROUVÉ + bug réel corrigé

**Sourcing** : mission §1bis, prochain maillon de la chaîne A après 1→6(read) = maillon 7 « Feed Google »
(le canal de SORTIE = cœur du north-star « feed Google LFP as a service d'abord »). Les fonctions PURES
(`buildLfpXml`, `transformProductToGoogle`, `filterFeedEligible`) étaient déjà testées
(`tests/lib/google/*`). Le trou = le **CHEMIN RÉEL** : le GATE des routes (le SELECT qui décide quels
produits atteignent le transform), exactement le motif maillon 5/6 + store_code.

**TROUVÉ + CORRIGÉ — bug réel n°1 (faux positif de sortie, divergence Voie A / Voie B)** : les DEUX
canaux Google filtraient DIFFÉREMMENT. Voie A (cron `google-feed`, Content API) : `visible AND validated
AND archived_at IS NULL AND variant_of IS NULL`. Voie B (`/api/feed/lfp/[merchantId]`, XML crawlé par
Google) : `visible AND validated` SEULEMENT. Or `archive_product` (RPC migration 068, granté
`authenticated`) met `archived_at = now()` SANS toucher `visible` → un produit archivé reste `visible=true`
→ la Voie B l'annonçait au crawler Google alors que les 6 autres surfaces (by-ean, quality-check,
pos/status, dashboard, cron, RPC consumer 065) l'excluent. Un produit archivé/supprimé annoncé aux
acheteurs Google = le catalogue fantôme qui a tué MVMS/Milo. **Vérifié dans le code réel** (LESSONS ~70 %
de faux findings) : variantes déjà exclues par `visible=false` (`sync-engine:732` pose `variant_of`+`visible:false`
ensemble) → `.is("variant_of", null)` redondant mais ajouté en PARITÉ défensive (le gate ne doit pas
dépendre de cette co-occurrence). **FIX** : `.is("archived_at", null).is("variant_of", null)` ajouté au
SELECT Voie B → les deux canaux émettent le MÊME ensemble (0 migration, pur read-path, réversible).

**TROUVÉ + CORRIGÉ — silent-failures adjacents (revue silent-failure-hunter)** : (Voie A) le SELECT
`products` avalait son `error` (`const { data: products } = ...` → `if(!products) continue`) = skip
SILENCIEUX du marchand sur erreur DB (feed périmé, 0 statut, 0 Sentry) → routé vers le catch externe
(captureError + statut "error") ; `if(!products)` théorique → throw plutôt que skip. (Finding 2, IMPORTANT)
le SELECT de LISTE `google_merchant_connections` avalait aussi son `error` → un blip DB faisait
`200 "aucun marchand connecté"` = TOUT le feed abandonné sans trace → `captureError` + `500`. (Finding 3,
Voie B) erreur DB du SELECT `connections` → fallback store_code par défaut sans trace → `captureError`
(feed gardé dispo, anomalie visible).

**PREUVE RÉELLE** (`tests/ingest-maillon7-google-feed-gate.test.ts`, +6) : faux client Supabase
**read-side** qui applique réellement `.eq()/.is()` + `.maybeSingle()` + thenable → on exerce le VRAI gate
des routes (TDD : 2 tests RED d'abord = produit archivé + variante qui fuitent dans le XML, puis GREEN
après fix). Couvre : archivé-mais-visible exclu, variante-visible exclue, produit actif passé (non-rég),
erreur DB products→500 (Voie B), erreur DB products→captureError+statut error (Voie A), erreur DB
connections→500+captureError (Voie A).

**TESTÉ** : `npm run test:run` → **602/602** vert (était 596, +6), `tsc` OK. Revue silent-failure-hunter :
3 findings traités (Finding 2 important = le select de liste).

**MÉTRIQUE** : maillon 7 (Sortie Google) — **gate de sortie PROUVÉ honnête + cohérent entre les 2 canaux**
(bug fantôme corrigé + 3 silent-failures clos). Aucune escalade de décision binaire (tout réversible,
0 migration). Reste de la chaîne A : maillon 8 (email-in de bout en bout). NB : le câblage `pushInventoryToGoogle`
sur le file-push reste `[G]` (écriture externe sous le compte Google du marchand — escaladé, hors périmètre boucle).

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 6 (Affichage honnête — prix promo) — COMPLÉTÉ + bug réel corrigé

**Sourcing** : mission §1bis plan B = maillon 6 (Affichage) via Playwright sur l'app live. **Contrainte
vérifiée** : ni Playwright ni MCP navigateur dispo dans l'environnement de la boucle (confirme le constat
récurrent « la boucle n'a pas de navigateur → Thomas valide le rendu »). La validation PUREMENT VISUELLE
(rendu « grossier vs pro », screenshots) reste donc à escalader à Thomas. J'ai traité la moitié
**vérifiable sans navigateur** : le READ-PATH qui alimente l'affichage = l'honnêteté de la donnée affichée
(north-star « afficher honnêtement, zéro faux positif »), comme aux maillons 4 (tailles fantômes) et 5
(fraîcheur). Surface choisie : le **prix promo** sur la grille consumer (hot path #1, route discover SANS
aucun test).

**TROUVÉ + CORRIGÉ — bug réel (faux rabais, garde asymétrique write→read)** : `POST /promotions` vérifie
`sale_price < product.price` à la CRÉATION (route promotions.ts:80), mais cette garde est FIGÉE. Le prix
produit peut BAISSER ensuite (re-ingest fichier, sync POS) sous une promo encore active (`ends_at` futur)
→ promo périmée dont `sale_price ≥ prix courant`. Les routes de lecture passaient `sale_price` BRUT au
front. `followed-feed.tsx:103` calcule alors `Math.round((price - sale)/price*100)` → **pourcentage
NÉGATIF/aberrant** (badge « -(-14)% »), prix barré incohérent (montant < « prix promo » mis en avant) ; et
`product-detail.tsx:125-128` → `discount` 0/négatif + `displayPrice` SUPÉRIEUR au prix réel. C'est le
mensonge de rabais que la garde de création existe pour empêcher. **Note** : `sticky-cta-bar.tsx:36` ET
`explorer-feed.tsx:47` gardaient DÉJÀ `sale_price < price` côté client — invariant connu mais appliqué de
façon **incohérente** (pas sur la grille principale, ni followed-feed, ni la fiche produit).

**FIX (réversible, 0 migration, pur read-path)** : helper pur unique `honestSalePrice(price, salePrice)`
(`src/lib/products/sale-price.ts`) = SOURCE UNIQUE serveur de l'invariant (sémantique identique aux gardes
client : renvoie `salePrice` ssi `< price`, sinon `null`). Appliqué aux **6 surfaces serveur** émettrices :
`products/discover` (primary RPC + fallback), `discover` (section promos + feed trending/nearby),
`by-merchants` (le tri `promo_first` s'aligne tout seul), `search`, `feed/promos`, et `products/[id]`
(filtre la jointure `promotions`). Pour les feeds « promos » (`discover?section=promos`, `feed/promos`),
en plus de neutraliser le rabais, la promo périmée est **filtrée du feed** (cohérent avec explorer-feed).

**REVUES silent-failure-hunter (2 passes)** : pass 1 sur les 3 routes discover → a révélé 5 surfaces
ADJACENTES non couvertes (mon « source unique » était surévalué) : `search`, `feed/promos`, `products/[id]`
(toutes corrigées serveur), + `shop-profile` (query promotions CÔTÉ CLIENT, hors périmètre serveur → suivi)
+ `followed-feed` cas `sale_price===0` (**INATTEIGNABLE** : `promotionBody.sale_price` = `z.number().positive()`
→ non corrigé, vérifié). Pass 2 sur les 3 nouvelles routes → SOUND + 1 LOW : `products/[id]` masquait
silencieusement TOUTES les promos si `price` null/0 (indistinct de « aucune promo ») → rendu VISIBLE via
`captureError` (pas `console.warn`, Sentry-invisible) en gardant la suppression prudente.

**PREUVE** (`tests/ingest-maillon6-honest-sale-price.test.ts`, +9) : helper (vrai rabais conservé, promo
périmée → null, == price → null, entrées non finies → null, sémantique identique aux gardes client) +
**verrou de contrat par route** (réplique la transformation inline de chaque route sur une vraie promo +
une périmée : map/filter/jointure → la périmée est neutralisée/exclue ; product-detail recalcule alors un
discount honnête +21% au lieu de -14%).

**TESTÉ** : `npm run test:run` → **596/596** vert (était 587, +9), `tsc` OK.

**MÉTRIQUE** : maillon 6 (Affichage) — **moitié read-path/honnêteté du prix promo PROUVÉE COMPLÈTE** (6
routes unifiées + bug réel corrigé). **Reste de maillon 6 = validation VISUELLE → ESCALADE Thomas** (pas de
navigateur côté boucle). Suivi non bloquant : `shop-profile` interroge `promotions` côté client (re-garder
inline ou router via API) ; le feed promos `discover` n'expose pas de `total` filtré (observabilité). Aucune
escalade de décision binaire requise (tout réversible) — seule l'escalade « valide le rendu visuel » subsiste.

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 5 (Confiance / fraîcheur) — COMPLÉTÉ + bug réel corrigé

**Sourcing** : mission §1bis, 1er maillon `⬜` non prouvé = maillon 5 (`source`/`source_ts` → label de
confiance honnête). Les fonctions PURES (`computeStockConfidence`, `productConfidence`,
`sourceStrengthFromStored`) étaient déjà bien testées. Le trou : le **CHEMIN RÉEL** — comment les 3 routes
consommatrices (`products/[id]`, `by-ean`, `by-merchants`) lisent `stock.*` en DB et le passent à
`productConfidence`. C'est exactement le motif « garde cosmétique » (LESSONS) : un paramètre de sécurité
ajouté par une migration doit être vérifié comme RÉELLEMENT lu par tous les appelants.

**TROUVÉ + CORRIGÉ — bug réel (faux positif de fraîcheur)** : la migration 104 a ajouté `stock.source_ts`
(heure RÉELLE de l'observation source) SPÉCIFIQUEMENT pour une fraîcheur honnête, et les webhooks le
remplissent avec l'heure de l'événement (commentaire route shopify : « source_ts = horodatage de la
vérité source … → confidence 'vu il y a X' honnête »). MAIS les 3 routes passaient `stock.updated_at`
(heure d'ÉCRITURE DB, bumpée à chaque write) comme `lastEventAt` → la garde était **cosmétique**. Un
webhook de vente traité avec retard (retry storm / backfill après outage POS) porte `updated_at=now` mais
`source_ts=heure de la vente` → l'app affichait **« vu à l'instant / Disponible »** pour une vente
observée des heures plus tôt. C'est précisément le mensonge de fraîcheur (« fraîcheur source_ts vraie »,
north-star §1) que la confidence existe pour empêcher.

**FIX (réversible, 0 migration, derrière aucun flag — pur read-path d'affichage)** : helper unique
`stockRowToConfidenceInput(stock)` dans `product-confidence.ts` (mappe une ligne `stock` → {quantity,
lastEventAt, storedSource}), `source_ts` ajouté aux 3 SELECT, les 3 routes routées par le helper. La
source unique évite qu'une 4ᵉ route régresse en silence vers `updated_at`.

**PREUVE RÉELLE** (`tests/ingest-maillon5-confidence-freshness.test.ts`, +9) : DIVERGENCE prouvée sur la
MÊME ligne — ANCIEN câblage (updated_at) → `available` + « vu à l'instant » (mensonge) ; NOUVEAU (source_ts
via helper) → webhook 30 h de retard = 30 h > limite realtime 24 h → `probable` + « vu il y a 1 j »
(honnête) ; retard modéré 3 h → reste `available` MAIS « vu il y a 3 h » (pas « à l'instant »). + forme
tableau PostgREST, stock absent → {0, null, null}, non-régression file_push frais.

**REVUE silent-failure-hunter** sur le diff → SOUND sauf 1 MED : les lignes pré-104 ont `source_ts`
back-fillé à l'heure de l'ALTER (`DEFAULT now()`, 2026-06-17), plus récent que leur vraie dernière
observation → surévaluation de fraîcheur. Vérifié en code réel : l'ALTER a aussi back-fillé `source='manual'`
(plafonné à `probable`, jamais `available`) → impact borné. **Adressé sans migration** : `freshnessTs()`
PLAFONNE `source_ts` à `updated_at` (on ne peut pas observer la source APRÈS l'avoir écrite ; un `source_ts`
postérieur est toujours un artefact migration/dérive d'horloge → on prend le plus ANCIEN, prudent). Le cas
honnête (source_ts < updated_at) renvoie bien source_ts. +1 test du plafonnement.

**TESTÉ** : `npm run test:run` → 587/587 vert, `tsc` OK.

**MÉTRIQUE** : maillon 5 (Confiance/fraîcheur) **prouvé COMPLET** (chemin réel câblé + divergence prouvée +
bug de fraîcheur corrigé). Chaîne data A : maillons 1→5 tous ✅. Prochain : **B — UI réelle (Playwright sur
l'app live)** = maillon 6 (Affichage) prouvé pour de vrai (accueil → onboarding → upload → dashboard →
vitrine + badge confiance), screenshots, liste sans complaisance du « grossier » vs pro. Aucune escalade
(travail 100 % réversible).

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 4 (Réconciliation de décrémentation) — COMPLÉTÉ

**Sourcing** : mission §1bis, 1er maillon `⬜` non prouvé = maillon 4 (Réconciliation : article absent
du snapshot → stock 0, jamais d'écrasement silencieux). Constat : le helper PUR (`selectProductsToZero`,
`chunk`) était bien testé en isolation (`ingest-reconcile.test.ts`), mais le **CHEMIN D'ÉCRITURE réel**
à travers `ingestStockSnapshot` (qui zéroe vraiment, émet `feed_events`, applique la source) n'était
JAMAIS prouvé de bout en bout. Trou comblé + un bug réel d'affichage trouvé en route.

**FAIT — PREUVE RÉELLE** (`tests/ingest-maillon4-reconcile.test.ts`, +8, faux client stateful comme
maillon 3) : CSV FR sale → `parseStockFile` → `ingestStockSnapshot` AVEC ÉCRITURES → `stock`/`products`/
`feed_events` inspectés champ par champ (sorties loggées) :
- **(a) décrémentation honnête** : catalogue {Nutella 6, Sneaker 3}, push ne contenant QUE le Nutella →
  Sneaker (absent = vendu) passe à `quantity:0`, `source:"file_push"` (le push décide l'épuisement, PAS
  la `pos_sync`/source périmée qui mentirait « en stock »), `source_ts` rafraîchi (≠ valeur seed),
  `feed_events out_of_stock` émis ; Nutella (présent) gardé à 5 (REPLACE), jamais touché par la réconcil.
- **(b) GARDE-FOU « zéro écrasement silencieux »** (le cœur du maillon) : un fichier tronqué couvrant
  17 % d'un catalogue de 12 (≥ `minCatalogForGuard`) → `reconcile_skipped:true`, **`stock_zeroed:0`,
  12/12 stocks restent à 5**, erreur « push probablement partiel, réconciliation annulée » visible.
  Idem un push 0-ligne-exploitable (fichier illisible, tout rejeté au triage) → annulé, stock préservé.
  Un fichier qu'on ne sait pas lire n'efface JAMAIS la boutique.
- **(c) rupture déclarée** : produit listé au fichier avec qty 0 → passe par l'UPDATE (touched), PAS par
  la réconciliation ; un 2e produit absent → décrémenté. Les deux finissent à 0 par des chemins
  DISTINCTS, sans double comptage (`products_updated:1`, `stock_zeroed:1`).

**TROUVÉ + CORRIGÉ — bug réel d'affichage (faux positif), 1 ligne de code prod élargie** : un produit
SIZED décrémenté à 0 gardait `products.available_sizes` avec des quantités positives périmées. La liste
discover gate sur `stock>0` (donc le produit disparaît bien), MAIS la **fiche produit**
(`product-detail.tsx:131` calcule `inStockSizes` depuis `available_sizes.quantity`) et la **facette de
tailles globale** (`/api/products/available-sizes`, gate `visible=true` seulement) lisent les qtés par
taille INDÉPENDAMMENT du total stock → **pointures fantômes « disponibles »** sur un produit épuisé =
malhonnête (north-star « afficher honnêtement »). Fix : vidage `available_sizes:[]` batché dans le write
de réconciliation (à côté du `stock=0` + `feed_events`), non bloquant (captureError + errors.push, le
stock=0 reste l'essentiel), restauré au prochain push qui re-contient le produit.

**REVUE** : silent-failure-hunter sur le diff `snapshot.ts` → **SOUND** (gestion d'erreur cohérente
avec les writes frères, pas de perte silencieuse, `[]` = sentinelle non destructive, ordering correct :
sizes vidées juste après stock=0, avant l'event). **TESTÉ** : `npm run test:run` → 578/578 vert, `tsc` OK.

**Reste** : maillon 5 (Confiance/fraîcheur : `source`/`source_ts` → label de confiance honnête) au
prochain run, puis B (UI Playwright sur l'app live). Aucune escalade (travail 100 % réversible).

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 3 (Ingest / match items→products) — COMPLÉTÉ

**Sourcing** : mission §1bis, 1er maillon `⬜` non prouvé = maillon 3 (Ingest/match : EAN/SKU,
create vs update, **0 doublon**). Constat : le test existant `ingest-snapshot.test.ts` ne couvrait
que les LECTURES en **dryRun** (aucune écriture) → le chemin RÉEL create/update et l'invariant
« 0 doublon » n'étaient JAMAIS prouvés sur le hot path n°1. Trou de couverture réel comblé.

**FAIT — PREUVE RÉELLE** (`tests/ingest-maillon3-match.test.ts`, +10) : construit un faux client
Supabase **stateful** (≠ le faux dryRun) qui applique vraiment `insert/update/upsert` sur un store
en mémoire, reproduisant la sémantique PostgREST utilisée par `snapshot.ts` (upsert onConflict
`product_id`, update-by-id, join réconciliation). Chaîne exécutée de bout en bout : CSV FR sale →
`parseStockFile` → `ingestStockSnapshot` AVEC ÉCRITURES → table `products`/`stock` inspectée champ
par champ (sortie loggée). 6 scénarios couvrant l'invariant north-star « capter sans rien oublier
ET sans doublon » :
- **(a) 1er push, catalogue vide** → 3 produits créés, ligne nom-seul rejetée = 0 ligne créée ;
  EAN-13 conservé, **UPC-12 `036000291452`→`0036000291452` canonicalisé AU CREATE** (cohérence
  cross-canal), SKU-only → `ean:null`, prix réels, **qté 6/24/7 (PAS le défaut 1)**, `visible:false`
  + `review_status:pending` (gate « zéro faux positif »), 3 enrichment_jobs enfilés.
- **(b) re-push du MÊME fichier → 0 créé / 3 update / table à 3 lignes inchangée** = l'invariant
  d'idempotence « 0 doublon » prouvé (match EAN + SKU casse-insensible), 0 ré-enfilement.
- **(c) cross-canal EAN** : produit déjà créé par le POS en EAN-13, fichier en UPC-12 → matché en
  UPDATE, 1 seul produit (le format d'EAN différent ne fabrique pas un fantôme).
- **(d) SKU casse-insensible** (`ts-0042` POS ↔ `TS-0042` fichier) → UPDATE.
- **(e) match par NOM** quand EAN/SKU ont changé (réétiquetage) → le nom dédoublonne l'existant.
- **(f) intra-push** : même EAN sur 2 libellés distincts dans UN fichier → CREATE puis UPDATE =
  1 seul produit (l'EAN identifie un produit). Sémantique REPLACE notée honnêtement : la 2e ligne
  écrase le stock de la 1re (dernière valeur, pas la somme) — défendable, un EAN = une quantité.

**REVUE** : diff **test-only** (0 ligne de code prod du pipeline modifiée) → `silent-failure-hunter`
n'a aucune surface prod à analyser. Non-vacuité du test établie par l'inspection de la sortie réelle
(qté ≠ 1, EAN canonicalisé, compteurs created/updated) + fidélité du faux client aux vraies chaînes.

**TESTÉ** : suite **560 → 570** verte, `tsc` 0. Réversible (`git revert`), 0 migration.

**MÉTRIQUE** : maillon 3 (Ingest/match) **prouvé COMPLET**. Prochain : maillon 4 (Réconciliation —
article absent du snapshot → stock 0, jamais d'écrasement silencieux ; preuve).

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 2 (Triage / identité) — COMPLÉTÉ + bug HIGH corrigé

**Sourcing** : mission §1bis, 1er maillon `⬜` non prouvé = maillon 2 (triage/identité). Méthode
qualité : maillon exécuté de bout en bout sur une vraie entrée sale, sortie inspectée champ par champ.

**FAIT — A. PREUVE RÉELLE du triage** (`tests/ingest-maillon2-triage.test.ts`, +15 puis +1) : export
FR sale (séparateur `;`, accents, codes répartis Code-barres/Référence) passé `parseStockFile` →
`triageStockItems`, chaque ligne inspectée : **4 GTIN** (EAN-13 valide ; **UPC-12 `036000291452`→
`0036000291452`** préfixe 0 = cohérence cross-canal POS ; GTIN rangé en colonne Référence → promu,
SKU non dupliqué ; **EAN-8 `96385074`** checksum 8-chiffres honoré), **3 SKU** (EAN au checksum
FAUX `3017620422004`→ suivi SKU, jamais envoyé aux lookups GTIN ; référence interne ; PLU court
`4011`), **2 rejets LISTÉS+MOTIVÉS** (`no_identifier` nom-seul / `invalid_identifier` code trop
court). Invariant `accepté(7)+rejeté(2)=total parsé(9)` vérifié — aucune ligne ne s'évapore.

**FAIT — B. ALERTE DE COUVERTURE DE COLONNES** (l'invariant north-star posé À CE MAILLON, cf. report
de la revue maillon 1) : `parseStockFile` renvoie désormais `coverage{quantity,identifier,price}`
(quelle colonne critique a été reconnue). `ingestStockSnapshot` reçoit `opts.coverage`, l'expose en
`column_coverage`, et **quand la colonne quantité n'est PAS reconnue** (→ qty=1 « présence » sur tout
le fichier) **pousse un message d'erreur** (statut honnête « partial » côté route + wizard) **+ Sentry
hors simulation**. On ne change PAS la sémantique présence (décision produit) — on l'arrête d'être
MUETTE. `identifier`/`price` manquants déjà non-silencieux en aval (tout-rejeté→`no_exploitable` ;
prix optionnel). Câblé dans les 2 appelants (`ingest-stock-file`, `catalog/import`).

**REVUE OBLIGATOIRE** (diff pipeline ingest) `silent-failure-hunter` : chaîne de propagation **SOUND**,
0 régression introduite. A trouvé **1 bug réel HIGH PRÉ-EXISTANT** (corrigé dans ce run) : le **stock
upsert du produit CRÉÉ** (`snapshot.ts` branche CREATE) **avalait son erreur** alors que la branche
UPDATE vérifie déjà `stockErr` → asymétrie : un produit créé dont l'upsert stock échoue restait SANS
ligne stock = lu « 0 » en aval = **perte silencieuse de la quantité**. Fix : erreur remontée
(`errors`+`captureError`, statut partial), `stock_replaced` **non compté** si l'écriture échoue (pas
de mensonge de compteur), pas de throw (le produit existe → prochain push complet le matche en UPDATE
= auto-guérison) ; tailles + feed_events de création idem (captureError, secondaire). DEFECT-2 (MEDIUM,
route 422 perdait `column_coverage`) corrigé. DEFECT-3 (LOW, bruit Sentry) : écarté — message
**constant** → Sentry groupe en 1 seule issue ; canal signal établi du projet pour data-quality.

**TESTÉ** : suite **544 → 560** verte, `tsc` 0. Réversible (`git revert`), 0 migration.

**MÉTRIQUE** : maillon 2 (Triage/identité) **prouvé COMPLET** (4 facettes + invariant couverture +
bug HIGH corrigé). Prochain : maillon 3 (Ingest/match items→products : match EAN/SKU, create vs
update, 0 doublon — preuve sur faux client/DB de test).

---

## 2026-06-22 (run autonome) · MISSION COURANTE maillon 1 (Parse) — COMPLÉTÉ + bug réel corrigé

**Sourcing** : mission §1bis (valider le workflow maillon par maillon, profondeur > vitesse).
Maillon 1 `Parse` avait 3 facettes restantes explicitement listées : XLSX binaire, encodage
Latin-1/CP1252, en-têtes inhabituels. Reprise du 1er `⬜` non prouvé.

**TROUVÉ (bug réel, prouvé EMPIRIQUEMENT avant de coder)** : `parseStockFile` décodait le CSV
texte en `buffer.toString("utf-8")` en dur. Or les POS legacy FR (Clictill, Fastmag) et Excel-FR
exportent en **Windows-1252 / Latin-1**. Repro octet par octet : en-tête « Quantité » (é=0xE9
CP1252) → `toString("utf-8")` = « Quantit� » → `detectColumns` ne matche plus → **la colonne
quantité est PERDUE EN SILENCE** → chaque ligne retombe sur qty=1 (« présence »). C'est
exactement l'ennemi north-star (« ne rien perdre silencieusement ») sur le hot path d'ingestion
(file-push API + canal email-in passent tous deux par ce parseur).

**FAIT (1 fichier prod + 1 test, réversible, 0 migration)** :
- Fix `decodeCsvBuffer` (`src/lib/ingest/parse-stock.ts`) : détection d'encodage — BOM UTF-16
  (le/be) → ; UTF-8 STRICT (`TextDecoder fatal`) : s'il décode c'est de l'UTF-8 ; sinon repli
  **Windows-1252**. Byte-identique pour tout UTF-8 valide (zéro régression) ; ne change le
  comportement QUE pour les fichiers qui cassaient déjà.
- `tests/parse-stock-encoding-formats.test.ts` (+10) — chaque facette sur une entrée RÉELLE,
  sortie inspectée champ par champ (PREUVE loggée) : (A) CP1252 → noms « Crème dépilatoire »/
  « Bûche pâtissière » décodés, marque « Lâncome », **qté 12 et 0 détectées** (pas le défaut 1) ;
  (B) **XLSX binaire** construit avec cellules numériques natives → qté/prix corrects, qté 0
  conservée ; (C) en-têtes **Gencode/Libellé/Qté/PU HT/Pointure/Fabricant** tous auto-mappés.

**REVUE OBLIGATOIRE** (diff pipeline ingest) `silent-failure-hunter` : **SOUND**. Confirmé :
catch→windows-1252 ne peut pas throw ni produire U+FFFD ; BOM UTF-16 ne peut pas faux-positiver
sur de l'UTF-8 valide (0xFF/0xFE jamais valides en UTF-8) ; byte-identique pour UTF-8 valide.
Seule suggestion (LOW) : logger le repli CP1252. **Écartée à dessein** : ce repli est le chemin
SAIN attendu pour les POS FR (le logguer = bruit, pas signal). Le vrai point de perte résiduel
nommé par la revue = « colonne qté non détectée → qty=1 sans alerte » → **reporté au maillon 2/3**
(triage/ingest) sous forme d'alerte de couverture de colonnes, là où l'invariant vit.

**TESTÉ** : suite **534 → 544** verte, `tsc` 0. Impact (hook gitnexus) : `parseStockFile` ←
2 routes POST (ingest/stock + catalog/import) ; changement interne `readRows`, risque LOW.

**MÉTRIQUE** : maillon 1 (Parse) **prouvé COMPLET** (3/3 facettes + 1 bug north-star corrigé).
Prochain : maillon 2 (Triage/identité) — avec l'alerte de couverture de colonnes en tête de pont.

---

## 2026-06-21 (session supervisée) · Two-Step Connect — MVP-1 : canal email-in stock (couvre Clictill/Fastmag)

**Décision produit (avec Thomas)** : après recherche d'état-de-l'art, le marché POS indépendants
FR est **majoritairement tablette** → l'agent desktop est une niche, pas la porte. Les POS réels
de Thomas = **Clictill + Fastmag**, qui **emaillent un CSV planifié nativement**. → canal
**email-in** = la porte. Formalisé en **ADR-002** (twostep-brain). Cloud-drive écarté (gate Google
CASA), agent desktop différé. Voir mémoire `connect-strategie-ingestion`.

**Livré (2 commits, gate vert, réversible)** :
- `refactor(ingest)` `7deb696` : **cœur partagé** `ingestStockFileForMerchant`
  (`lib/ingest/ingest-stock-file.ts`) extrait de `/api/ingest/stock` — comportement HTTP
  identique, invariants conservés (idempotence hash, verrou, REPLACE+reconcile, statut honnête,
  `last_file_hash` posé QUE si abouti = heartbeat). +8 tests.
- `feat(ingest)` `8c68632` : **branche email** `stock-{slug}@twostep.fr` → cœur partagé.
  Routeur pur `parseInboundAddress` (+8 tests, rétro-compat factures byte-for-byte). Garantit la
  ligne `ingest_credentials` via `getOrCreateIngestToken` (verrou/heartbeat y sont keyés).
- **Revue silent-failure : SOUND**. 2 flags **corrigés avant commit** : (A) multi-fichiers =
  reconcile last-wins silencieux → **contrat snapshot unique** (>1 tableur → alerte + 0 ingestion) ;
  (B) email stock sans tableur exploitable → `captureError` visible. Gate : tsc 0, **523 tests**.

**🚀 MERGE + DÉPLOIEMENT PROD FAIT (GO Thomas 2026-06-21)** : `feat → main` mergé **sans conflit**
(commit `5a93bbc`, merge 3-way propre avec les 76 commits prospection de `main`), **aucune
migration** (prod = branche = 106), gate 523 vert sur le résultat. Poussé → déploiement Vercel
**production `dpl_6576onJw…` READY** (build ~53 s). **`twostep.fr` LIVE** (smoke : `/`=200,
`/connexion`,`/discover`,`/dashboard`=307). **Premier passage en prod de tout le software.**
Filets : tag `backup/main-pre-merge-20260622` + rollback Vercel `dpl_2c1KGPKpt`. WhatsApp envoyé.

**Resend RÉSOLU** : le vrai domaine inbound = **`twostep.fr`** (cf. `email-setup-guide.tsx` :
`factures-…@twostep.fr`, qui marche déjà en prod) → `stock-…@twostep.fr` arrive **automatiquement**,
**Resend n'a besoin de rien**. (Correction : mes docs disaient `in.twostep.fr` à tort.)

**RESTE** : (1) [R] **monitor de fraîcheur** sur `ingest_credentials.last_used_at` (couvrir le canal
email, juger sur récence, pas `last_status`) — sinon un feed figé reste silencieux. (2) Pages
onboarding guidées par POS (Clictill/Fastmag) avec l'adresse `stock-{slug}@twostep.fr`. (3) Connecteur
API Hiboutik (si besoin temps-réel plus tard). (4) `GOOGLE_DISAPPROVAL_ALERTS=1` en env Vercel
(active la persistance marchand des rejets Google ; inerte sinon). (5) Rotation PAT Supabase faite
par Thomas — confirmer que le nouveau token est dans la var d'env User (sinon la boucle cassera).

**⚠️ Concurrence** : `TwoStepAutonomy` **mise en pause (Disabled)** pendant la session supervisée.
**À RÉACTIVER** en fin de collaboration.

---

## 2026-06-21 (run autonome, soir) · Rang 3 [R] — contrat d'orchestration `syncMerchantPOS` verrouillé (test-only)

**Sourcing par signaux** : pas de signaux d'erreur réels (`notify-extra` vide, cost-ledger sain,
haut backlog Rang 0-2 gated/externe). Le seul hot path du sync POS encore non testé, nommé par
les 2 entrées précédentes : l'**orchestrateur `syncMerchantPOS`** lui-même (les writes unitaires
étaient couverts, pas le câblage d'ensemble). C'est le pilier 1 du north-star (« capter le stock
de toute source en n'oubliant rien »).

**Fait (commit `4620d77`, 0 ligne de prod, réversible)** : `tests/pos-sync-engine-orchestrator.test.ts`
(+5 tests) verrouille le **contrat catch→bookkeeping** de l'orchestrateur — l'invariant
« ne rien perdre sans alerte » au niveau orchestration :
1. **lock occupé** par un autre sync → retour all-zeros SANS toucher token/adaptateur/écriture
   (skip de concurrence sûr, pas une perte) ;
2. **refresh token KO** → `last_sync_status="error"` + `last_sync_error` + `syncing_since` libéré
   + `captureError({merchantId,provider})` + RE-LÈVE ; catalogue jamais fetché ;
3. **lecture connexion en erreur DB** → LÈVE `No POS connection found`, status `error` ;
4. **hoquet POS transitoire** (`getCatalog` jette) → status `error`, **JAMAIS** de masquage
   orphelins (anti catalogue-fantôme) **NI** de bookkeeping `success` (anti faux-positif) ;
5. **chemin nominal** (catalogue vide) → `success`, `last_sync_error=null`, sans `captureError`.

**Trouvé** : rien de cassé — l'orchestrateur respecte déjà son contrat (les runs précédents
avaient câblé les throws). Ces tests **prouvent** la chaîne catch→`error`→Sentry→rethrow que la
LESSON « après avoir fait lever un symbole, vérifier que CHAQUE caller remonte à Sentry » exigeait
de garantir. Faux client Supabase thenable (`makeSupabase` + `respond`) fidèle aux 4 vraies chaînes
(lock acquire / conn read / error-bookkeeping / success-bookkeeping), discrimination non-chevauchante.

**Revue OBLIGATOIRE** : diff **test-only** (0 code pipeline modifié → pas de nouvelle surface de
silent-failure prod). Revue `typescript-reviewer` (le bon spécialiste pour un diff de test) :
**SOUND** — 5 tests non vacants (chaque régression plausible casse un test), mocks fidèles, pas de
fuite de mock ni de souci async/hoisting. 0 action requise.

**Testé** : suite **502 → 507**, tsc OK. (Pre-push gate au push.)

**Métrique** : 1 item [R] fermé = **dernier hot path du sync POS non testé** → couvert. La
métrique-garde-fou (couverture des chemins critiques) MONTE. 0 migration/merge/email, réversible.

**Reste** : haut du backlog (Rang 0 e2e/preview, Rang 1-2 Google file-push / multi-tenant webhook /
RPC delta) reste **gated/externe** (en attente GO Thomas, déjà escaladé). Le réversible « couverture
hot path » du pipeline stock est désormais **épuisé** sur le sync — cf. §5.4 honnêteté de rendement.

---

## 2026-06-21 (run autonome, après-midi) · Rang 3 [R] — hot path WEBHOOKS POS : aucun `error` avalé (commit `8e5872f`)

**Sourcing par signaux** : pas de signaux d'erreur réels (Supabase MCP : 1 connexion POS
`success`, 0 `quality_alerts` — cohérent 0 marchand). Haut backlog gated/externe, notify vide.
→ §6.3 couverture/intégrité d'un hot path. Le hot path **webhooks temps réel** (push stock POS,
= « afficher en quasi temps réel honnêtement » du north-star) avait un `error` avalé **vérifié
ligne à ligne** dans `resolveWebhookProduct` (LESSONS ligne 54, pattern exact).

**Trou réel #1 (le fix cœur)** : `resolveWebhookProduct` (appelé par les 4 routes
square/shopify/lightspeed/zettle) faisait `const { data } = ...` sur la lecture produit par
`pos_item_id` → un **échec DB transitoire** devenait indistinct de « produit non suivi » (les deux
→ `null` → `if(!product) continue` → **200 OK**). Une MAJ stock temps réel **perdue, le POS ne
renvoie jamais** = perte silencieuse n°1. → **LÈVE** sur `error` (distinct du 0-candidat qui reste
`null` normal) → catch route → `captureError` + 500 → **retry POS**. Récupérabilité selon mode :
absolu (Square/Zettle, pas d'idempotence) → retry ré-applique = **récupéré** ; delta
(Shopify/Lightspeed, `webhook_events` inséré AVANT la boucle) → retry dédupliqué = au moins
**VISIBLE** (l'idempotence-first protège du double-décrément). **+4 tests** (cas erreur DB lève).

**Balayage du reste du hot path (findings revue, tous VÉRIFIÉS dans le code)** :
- **3a/3b** (shopify+lightspeed, HIGH/MEDIUM) : le **check ET l'insert `webhook_events`**
  (idempotence) avalaient `error` → un check raté = `existing=null` = **re-traitement = double-
  décrément delta**. → `captureError` + 500 (retry → dedup).
- **3c** (4 routes) : insert `feed_events` avalé → `captureError`-et-continue (stock déjà committé ;
  throw → 500 → retry = double-décrément delta, donc **pas** de throw).
- **3e** (4 routes) : lookup merchant pour `pushInventoryToGoogle` avalé → `captureError`.
- **3d** (nom produit pour push) écarté à juste titre (fire-and-forget, fallback sain).

**Revues OBLIGATOIRES `silent-failure-hunter`** (2 passes, diff pipeline) : **SOUND**, 0 régression,
choix throw-vs-capture validés par mode d'échec, UNIQUE-violation concurrente sûre (retry → dedup).

**Testé** : suite **498 → 502**, tsc OK, pre-push gate vert, push SSH (`8e5872f`). LESSON ajoutée
(2 entrées : erreur-DB ≠ absent dans un résolveur webhook ; check/insert idempotence non avalés).

**Escalade (notify-extra)** : **Finding 2** = design idempotence delta (insert-AVANT = at-most-once :
une vente peut être perdue sur échec de traitement + retry-dedup — **désormais VISIBLE**, plus
silencieuse). Binaire A (garder, perte rare tracée) vs B (at-least-once exactly-once = design +
migration). **Urgence FAIBLE** (0 marchand, visibilité posée). Préparé : visibilité committée.

**Métrique** : 1 item [R] fermé = **hot path webhooks POS sans perte/double-comptage silencieux
non testé** (le 2ᵉ pilier du north-star « temps réel honnête » durci). 0 migration/merge/email,
réversible. Reste non testé (plus petit) : `syncMerchantPOS` orchestrateur end-to-end (gros mock).

---

## 2026-06-21 (run autonome) · Rang 3 [R] — derniers writes silencieux de `sync-engine` rendus non silencieux (gate visibilité + compteurs honnêtes)

**Sourcing** : signaux + worklog. Le prochain [R] nommé par les 2 entrées précédentes =
les writes encore silencieux de `sync-engine.ts` (`groupVariantsByEAN` = « plus gros trou »,
`updateProduct`, `upsertPromo`). **Chaque finding VÉRIFIÉ dans le code réel** avant d'agir
(LESSONS : ~70 % des findings devinés sont faux) — ici tous confirmés ligne à ligne.

**Trous réels corrigés (commit `6c21c5d`, réversible, 0 migration)** :
- **`groupVariantsByEAN`** (le GATE « zéro faux positif ») : la lecture + **5 sites
  d'écriture** avalaient `error`. Un échec laissait soit une **variante non masquée**
  (doublon fantôme visible à côté du principal), soit un produit jamais publié, soit un
  stock principal périmé. → **LÈVE** désormais (writes absolus+idempotents, AVANT le
  bookkeeping succès → sync `error`+Sentry, re-converge au re-run sans double-comptage).
- **Marquage `pending_review`** des nouveaux produits POS : avalait `error`. Vérifié :
  `create_product_with_stock` (092) n'INSÈRE pas `review_status` → défaut NULL = traité
  `validated` par le gate → `groupVariantsByEAN` **publierait un produit non validé** =
  faux positif cardinal. → **LÈVE** sur échec.
- **`updateProduct`** : avalait `error` ET le caller posait `products_updated = toUpdate.length`
  même en échec (compteur menteur, dérive prix/nom). → renvoie un booléen + `captureError` ;
  le caller ne compte que les succès. **Non bloquant** (1 ligne fautive ne fige pas le sync).
- **`upsertPromo`** : lecture prix + upsert promo avalés, `promos_imported++` inconditionnel.
  → `captureError` + n'incrémente que sur succès.
- **2 findings de revue traités dans la foulée** : `createProduct` (write taille) +
  `invoices/[id]/validate` (catch de `groupVariantsByEAN` qui n'avait que `console.error` —
  **élevé par ce diff** : mon throw l'aurait rendu Sentry-invisible) → remontés à Sentry.

**Revue OBLIGATOIRE `silent-failure-hunter`** (diff pipeline) : **SOUND, 0 régression**,
choix throw-vs-capture jugés corrects par mode d'échec, pas de hazard de partial-write
(idempotent-absolu). A surfacé les 2 findings ci-dessus (1 élevé par le diff → traité ;
restes pré-existants hors scope : swallow interne de `createImageJob` LOW → backlog).

**Testé** : +9 tests (`tests/pos-sync-product-promo-writes.test.ts` neuf : updateProduct +
upsertPromo ; +3 cas throw dans `pos-group-variants.test.ts`). Suite **489 → 498**, tsc OK,
pre-push gate vert, push SSH.

**Métrique** : 1 item [R] fermé = **le dernier gros cluster de writes silencieux de
`sync-engine` est clos** (le hot path POS sync n'a plus de perte/mensonge silencieux non
testé). **LESSON** ajoutée (audit des catch des callers après avoir fait lever un symbole +
critère throw-vs-capture). **Reste non testé (plus petit)** : parse webhooks (partiel),
`syncMerchantPOS` end-to-end (intégration, gros mock adapter). Haut du backlog (Rang 0-2)
toujours gated/externe (merge, migrations prod, design multi-tenant) — **rien de neuf à
escalader** (notify-extra vide ; décision 106+flag déjà tranchée).

---

## 2026-06-20 (session supervisée, nuit) · Rang 3 [R] — writes orchestrateur `syncMerchantPOS` non silencieux + housekeeping vérifié

**Vérifs de reprise (handoff partiellement obsolète, dit franchement)** :
- **Supabase MCP OK** via `SUPABASE_ACCESS_TOKEN` en env (list_projects + execute_sql) — le
  passage en `${...}` n'a rien cassé. **Migration 106 reconfirmée en prod** (CHECK
  `quality_alerts.type` contient `google_disapproved`).
- **`google/inventory` était DÉJÀ fini, committé ET poussé** (run 4) — la tâche « finir
  inventory » du handoff était obsolète.

**Sécu `.mcp.json` — fausse info CORRIGÉE** : redaction du token Supabase en
`${SUPABASE_ACCESS_TOKEN}` committée en local (`IA` repo = remote `TOMMYBAUL/CLYNE.git`, commit
`51b38f5`), **redaction chirurgicale sur HEAD via l'index** → le WIP `.mcp.json` de Thomas n'est
PAS embarqué (working tree jamais touché). **CORRECTION** : ce worklog disait « token poussé sur
CLYNE privé » → **FAUX**. Vérif git : `f8be153` (token en clair) sur AUCUN ref distant,
`origin/main` sans token. **Le token n'a jamais quitté le local** → **NE PAS pousser**
`feat/twostep-phase1` (l'exposerait via `f8be153`). Urgence rotation = FAIBLE, reste propre à
faire (Thomas). Correctif durable : `.gitignore` + `.mcp.json.example`.

**Item Rang 3 [R] livré — writes de l'orchestrateur `syncMerchantPOS` (commit `567dd44`)** :
complémentaire de run 5 (qui a couvert `recalc`/`groupVariantsByEAN`). Le trou réel restant =
les **writes inline de `syncMerchantPOS`**, CRITIQUES sur 2 modes d'échec du north-star :
- **Upsert stock batch** : `error` avalé ET `result.stock_updated = rows.length` posé même en
  échec → stock NON persisté rapporté « success » = **faux positif n°1** (vendu affiché en stock).
- **Masquage orphelins** : `error` avalé → produit retiré du POS resté visible = **catalogue
  fantôme** (mode d'échec qui a tué MVMS/Milo).
- Extraits en helpers exportés injectables `applyStockUpserts` + `hideOrphanProducts` qui
  **LÈVENT** sur erreur → catch existant de `syncMerchantPOS` (`last_sync_status='error'` +
  Sentry + rethrow ; les 4 routes appelantes tolèrent déjà un throw). `stock_updated` = nb
  réellement écrit (ne ment plus). **Revue silent-failure : SOUND** (aucun nouveau swallow ;
  throw correct car writes idempotents → re-sync re-converge).
- **+8 tests** `tests/pos-sync-engine-writes.test.ts`. Gate : tsc 0, suite **481→489** (delta =
  exactement +8/+1, mesuré par stash/baseline). Note LESSON candidate : ~9 tests de la suite
  varient selon l'horloge murale (fenêtres fraîcheur/lock/promos) → devraient figer le temps.

**⚠️ Concurrence observée** : run 5 (autonome, 23:17) a committé pendant cette session supervisée
et a touché le MÊME fichier (`sync-engine.ts`, fix recalc l.728). Pas de casse (régions non
chevauchantes, mon WIP non embarqué dans HEAD), mais signal : un run autonome et une session
supervisée peuvent se marcher dessus. À cadrer (pauser la tâche pendant les sessions supervisées ?).

**Métrique** : 1 item `[R]` fermé (writes orchestrateur sync = non silencieux + testés). 0
migration/merge/email/dépense, réversible. **Restent non testés (prochain [R], ranking revue)** :
`groupVariantsByEAN` writes (visibilité/rollup autoritaires, encore silencieux — plus gros trou),
`updateProduct` (dérive prix/nom), `upsertPromo` (promo perdue + `promos_imported` qui ment).

---

## 2026-06-20 (run 5) · Rang 3 [R] — couverture `sync-engine` writes → BUG RÉEL trouvé (recalc zéroe le stock solo) [RUN AUTONOME]

Sourcing par signaux : prochain [R] du worklog = couverture des writes `sync-engine`
(dernier gros hot path non testé). En écrivant les tests du write le plus critique
(`groupVariantsByEAN`, le GATE visibilité « zéro faux positif »), un test sur
`recalculateGroupSizes` a échoué et révélé un **bug de prod réel**, vérifié dans le code.

**🔴 Bug (faux « rupture » silencieux = enjeu n°1)** : `recalculateGroupSizesAdmin`
(`recalculate-sizes.ts`, appelé par les **4 webhooks** square/shopify/lightspeed/zettle
APRÈS `updateStockAtomic`) totalisait le stock sur les **seuls membres ayant une taille**
(`availableSizes.reduce`). Pour un produit **SOLO sans pointure** (la majorité du non-mode),
`availableSizes=[]` → `totalStock=0` → `upsert stock=0` qui **écrase la qté que le webhook
venait de poser** → produit affiché en rupture jusqu'au resync 6 h = **vente perdue
silencieuse**. + le write `available_sizes` était inconditionnel ([] écrasait les tailles
de l'ingestion fichier — exactement le bug LESSONS #42, jamais appliqué à ce jumeau).

**Fix (commit `8660497`, réversible, 0 migration)** : early-return `if (availableSizes.length
=== 0) return;` dans les **deux jumeaux** (`recalculateGroupSizesAdmin` prod + son clone
`recalculateGroupSizes` sync-engine, inutilisé en prod mais gardé identique) → un produit
solo n'a NI son stock autoritaire NI son available_sizes écrasés. + writes du rollup rendus
**non silencieux** (`captureError` SANS lever — le stock est déjà committé ; lever ferait
rejouer le webhook = double-décrément en mode delta).

**Couverture livrée** : `tests/pos-group-variants.test.ts` (9 cas) — verrouille (a) le **GATE
visibilité** de `groupVariantsByEAN` (pending/masked/pending_review **jamais** visibles malgré
stock>0 ; validated/NULL→visible si stock>0 ; regroupage par préfixe EAN, élection principal
photo-prioritaire, available_sizes triées, total au principal) ; (b) le bug-fix ci-dessus ;
(c) les writes du rollup remontés (Sentry) au lieu d'avalés.

**Revue obligatoire** `silent-failure-hunter` (diff pipeline) : **SOUND, 0 régression**. A aussi
flaggé 2 silent-failures **pré-existants hors scope** (laissés, anti scope-creep, → backlog) :
les `.catch(()=>{})` sur `notifyProductFavorites` (LOW) et **`pushInventoryToGoogle` (MEDIUM —
divergence Google MC sans signal)** dans les 4 webhooks.

**Testé** : 472 → **481** tests (+9), tsc OK, pre-push gate vert, push SSH.

**Métrique** : 1 item [R] fermé (dernier gros write sync-engine couvert) **+ 1 bug de prod réel
corrigé** (silent stock loss, north-star n°1) — la couverture a directement produit un fix, pas
juste des tests. **Suite (commit `12e08cc`)** : le finding de la revue traité dans la foulée —
`pushInventoryToGoogle().catch()` (MEDIUM) + `notifyProductFavorites().catch()` (LOW) des 4
webhooks remontent maintenant via captureError (observabilité seule, 0 flux). **PROCHAIN [R]** :
couverture parse webhooks (partiel) OU `syncMerchantPOS` orchestrateur (intégration). Le haut du
backlog (Rang 0-2) reste gated/externe (merge, migrations prod, design multi-tenant) — rien de
neuf à escalader ce run (notify-extra vide ; décision 106+flag déjà tranchée par Thomas).

---

## 2026-06-20 (session supervisée, soir) · Migration 106 APPLIQUÉE + intégration ECC + token Supabase sécurisé

**Fait avec Thomas (GO explicites)** :
- **Migration 106 APPLIQUÉE en prod + vérifiée** (`quality_alerts.type` accepte `google_disapproved`).
  Branche test Supabase **infaisable** (l'historique des migrations ne se rejoue PAS depuis zéro →
  finding reproductibilité/DR à traiter) → appliquée direct sur GO Thomas après vérif live (swap de
  CHECK atomique, sur-ensemble strict, risque nul). → la persistance MARCHAND des rejets Google
  s'activera au merge+déploiement avec `GOOGLE_DISAPPROVAL_ALERTS=1`.
- **Intégration ECC** (repo gagnant hackathon Anthropic, `affaan-m/ECC`) : 7 agents spécialistes
  (`.claude/agents/` : silent-failure-hunter, database-reviewer, security-reviewer, typescript-reviewer,
  tdd-guide, loop-operator, harness-optimizer), AUTONOMY §11 (Prompt Defense Baseline + denylist
  destructive + revues obligatoires + honnêteté Minimum Bar 2026), priorities §8 (pilotage), 2 leviers
  coût = set MCP minimal (Supabase seul) + codemaps `docs/CODEMAPS/`.
- **Sécurité** : `SUPABASE_ACCESS_TOKEN` était en clair dans `IA/.mcp.json` (suivi, poussé sur CLYNE
  **privé**) → sorti en variable d'env `${SUPABASE_ACCESS_TOKEN}` (root + autonomy.mcp.json). RESTE
  THOMAS : **rotation** du token (dashboard Supabase — aucun outil ne révoque un PAT) + commit du
  `.mcp.json` côté CLYNE.

**Reste / déploiement** : poser `GOOGLE_DISAPPROVAL_ALERTS=1` en env Vercel au déploiement (inerte avant).

---

## 2026-06-20 (run 4) · Rang 3 [R] — couverture `google/inventory` + RÉCUPÉRATION de WIP orphelin [RUN AUTONOME]

**Contexte de reprise** : `git status` au démarrage montrait `M src/lib/google/inventory.ts`
NON committé. Le ledger confirme : le run précédent (`131701`, **exit=1**, 18 turns) a été
**interrompu** et a laissé ce travail orphelin dans le working tree. Décision : le **finir**
(tests + revue + commit) plutôt que le jeter — c'est du travail sain, aligné north-star, et le
perdre aurait été une régression nette. (→ LESSONS : vérifier le WIP orphelin au démarrage.)

**Item** : Rang 3 `[R]` « couverture de test des chemins critiques non testés » →
`google/inventory` était le dernier hot path de sortie Google **sans aucun test** (listé non
testé en run 3). C'est le faux positif n°1 (un vendu affiché « in stock » sur Google).

**Livré (commit `adfb272`, 459→472 tests, +13, 0 migration, réversible)** :
- Le WIP orphelin extrayait 2 helpers PURS de `pushInventoryToGoogle` :
  - `resolveStockQuantity` : normalise l'embed PostgREST `stock(quantity)` (objet|tableau|
    null|string) → qté, **défaut CONSERVATEUR 0** (forme illisible → « out of stock », jamais
    un faux « in stock »).
  - `buildLocalInventoryPayload` : **verrouille** `availability` = « in stock »/« out of stock »
    AVEC ESPACE (l'underscore = rejet silencieux Google, cf. feed.ts).
  - **Fix silent-failure** : le read produits distingue désormais `error` de « aucun produit »
    (`captureError` + return) — avant, un échec DB laissait l'inventaire Google **périmé en
    aveugle**. Contrôle de flux inchangé pour les 4 webhooks + sync-engine appelants (toujours
    return sans push), seule l'observabilité est ajoutée → 0 régression.
- **Ce que j'ai ajouté ce run** : le **fichier de test** `tests/lib/google/inventory.test.ts`
  (13 cas : toutes les formes d'embed, défaut conservateur, NaN/négatif clampés, invariant
  espace anti-underscore) + après revue, la **quantité dans le contexte `captureError`** du push
  (diagnostic faux positif/négatif).
- **Revue `silent-failure-hunter`** : changement jugé **sain**, 0 silent path résiduel. 1 reco
  low (qté dans le contexte Sentry) **appliquée** ; 1 reco pré-existante hors scope
  (`merchant.ts` `res.json().catch(()=>({}))`) **laissée** (anti scope-creep).

**Métrique** : 1 item `[R]` fermé (dernier hot path Google sans test → couvert) + 1 WIP orphelin
récupéré au lieu d'être perdu. Couverture des hot paths qui **monte** (garde-fou §1). Aucune
migration/merge/email/dépense. **PROCHAIN [R]** : couverture des writes `sync-engine` (dernier
gros hot path non testé) — chunk dédié pour un run profond. Le haut du backlog reste gated/externe.

---

## 2026-06-20 (run 3) · §1 work-item n°1 [R] — invariants de complétude testés (lectures non silencieuses) [RUN AUTONOME]

Sourcing par signaux → couverture de test d'un hot path + le **work-item n°1 dérivé
du §1** (« aucune source ne perd un produit/qté/prix SANS ALERTE » → en faire des
invariants TESTÉS). 2 unités finies, gate vert à chaque commit, 0 garde-fou franchi.

**① ingest snapshot — 2 lectures qui masquaient une erreur DB (commit `0b991ea`, +3 tests)** :
`ingestStockSnapshot` destructurait `data` sans `error` sur deux reads conséquents.
- **read produits existants** échoué → index de match VIDE → chaque ligne recréée en
  **doublon de TOUT le catalogue**, en silence. → désormais on **LÈVE** (les 2 routes
  catch + captureError) plutôt que corrompre la boutique en aveugle.
- **read stock en cours** (réconciliation) échoué → `?? []` → réconciliation **no-op**
  → articles vendus restant affichés « en stock » (**faux positif n°1**). → réconciliation
  **annulée + VISIBLE** (statut partial/error côté route + captureError).
  Testable via `dryRun:true` (les 2 reads s'exécutent, 0 écriture) + faux client Supabase.

**② resync stock — même classe (commit `3ebf7d6`, +2 tests)** :
- `resyncMerchantStock` read produits échoué → renvoyait `ok:true, fetched:0` (resync
  « propre » qui n'a RIEN guéri ; dérive persistante, 0 signal) → `ok:false` + captureError.
- `resyncAllMerchantsStock` read connexions échoué → « ne guérit personne » en se rapportant
  ok → **LÈVE** (cron pos-resync catch → 500 + Sentry).

**Discriminateur (LESSON ajoutée)** : le pattern `const { data } = await ...select()` sans
`error` existe sur ~250 sites — la PLUPART sont des reads auth/lookup où `null→401` est
correct (NE PAS chasser, cf. ~70% faux positifs Explore). Bug SSI empty est indistinct
d'erreur ET cause une perte silencieuse masquée en succès. `groupVariantsByEAN:520` vérifié
**bénin** (read échoué → grouping sauté ce run, re-run à chaque sync, 0 corruption) → laissé.

**Métrique** : 2 items `[R]` fermés, tous deux le work-item n°1 du §1 (complétude → invariants
testés). +5 tests (454→459). Aucune migration/merge/email/dépense. **PROCHAIN [R]** : poursuivre
la transformation des garde-fous épars en invariants testés (couverture hot paths restants :
sync-engine writes, webhooks) OU e2e preview à jour. Le haut du backlog reste gated/externe.

---

## 2026-06-20 (run 2) · Rang 1 [R] store_code unifié + Rang 0 [R] merge-readiness [RUN AUTONOME]

Sourcing par signaux → 2 items `[R]` de plus haut rang non faits, tous deux **fermés** ce run
(2 unités finies + tests, gate vert à chaque commit).

**① Rang 1 [R] — Unifier `store_code` (commit `21e9004`, 454 tests, +14)** :
- **Divergence vérifiée dans le code réel** : Voie A (Content API — callback OAuth +
  crons `google-feed`/`inventory`) persistait `twostep-{id8}` dans
  `google_merchant_connections.store_code` ; Voie B (feed XML public `lfp-xml.ts`) émettait le
  **`slug`** du marchand. Pour un MÊME marchand, Google recevait **deux store_code** →
  **deux magasins fantômes** distincts, inventaires jamais réconciliés = **faux positif LFP**
  (north-star « afficher honnêtement »).
- **Source unique** : le store_code canonique = la valeur **persistée** dans
  `google_merchant_connections` (liée au compte Google / futur Business Profile). Nouveau
  `src/lib/google/store-code.ts` : `defaultStoreCode` (unique générateur de la formule, ex-inline
  callback) + `resolveStoreCode` (persisté prime, repli déterministe, **jamais le slug**).
- Câblé : callback (DRY), `buildLfpXml` prend un `storeCode` explicite (3ᵉ arg), route feed XML lit
  la connexion + `resolveStoreCode` → **même store_code que Voie A**. Drop du check
  `merchant_missing_slug` (store_code toujours résoluble). Impact LOW (seul le route consomme
  `buildLfpXml`), 0 migration, réversible. `detect_changes` = scope attendu (2 routes + lib + test).

**② Rang 0 [R] — `docs/merge-readiness.md` (NOUVEAU, commit ci-dessous)** :
checklist binaire merge→deploy. **Faits vérifiés live** (Supabase MCP `list_migrations`) :
prod appliquée **jusqu'à 105** ; **106 NON appliquée = volontaire** (gated derrière
`GOOGLE_DISAPPROVAL_ALERTS`, inerte) → **le merge n'exige AUCUNE migration**. Branche =
**84 commits d'avance** sur `main` (le backlog disait « ~30+ » = périmé, corrigé). Env prod :
seul `INSEE_API_TOKEN` est à enjeu réel (fail-open SIRET) ; le reste = dégradations non
bloquantes. **Bloquant restant = validation visuelle UI + GO humain** (rien côté software).

**Métrique** : 2 items `[R]` fermés (1 Rang 1 + 1 Rang 0). Le Rang 0 transforme « est-ce mûr ? »
en checklist → rapproche la décision merge du point « une décision de Thomas ». Aucun garde-fou
franchi. **PROCHAIN [R]** : re-jouer l'e2e sur preview à jour (84 commits depuis le dernier vert)
OU couverture de test d'un hot path non testé. Le haut du backlog non fait est sinon gated/externe.

---

## 2026-06-20 · Rang 1 [R] — Observabilité productStatuses Google : fin du PUSH AVEUGLE [RUN AUTONOME]

Sourcing par signaux (priorities §6) → backlog priorisé, item Rang 1 `[R]` le plus
haut **non fait** : « Observabilité productStatuses — lire l'acceptation/rejet Google
par produit. Aujourd'hui on POUSSE en aveugle. » C'est le faux positif n°1 du
north-star (« affiché honnêtement »), réversible et haute valeur. **Fait** (vs micro-fix).

**Le trou (vérifié dans le code réel)** : `google-feed` compte un produit comme
`pushed` dès que `productInputs:insert` renvoie 200. Mais un 200 à l'insert ≠
acceptation — Google traite ensuite de façon **asynchrone** et peut REJETER (GTIN
invalide, image, politique). On ne relisait JAMAIS le résultat → un produit rejeté
restait affiché « sur Google ». Shape API vérifiée sur la doc officielle
(`products.v1beta` → `accounts/{account}/products`, `destinationStatuses` +
`itemLevelIssues.severity ∈ NOT_IMPACTED|DEMOTED|DISAPPROVED`) **avant** de coder,
pour ne pas bâtir une garde inerte sur un schéma deviné (cf. LESSONS).

**Livré — RÉVERSIBLE, en prod via Sentry (commit `87ad085`, 442 tests)** :
- `src/lib/google/product-status.ts` : reader **paginé** (borné anti-boucle, **lève**
  sur erreur dure = anti stock-fantôme) + `summarizeProductStatuses` **PUR** (servis/
  en attente/rejetés + causes agrégées par code). Verdict basé sur `destinationStatuses`
  (signal **stable cross-version**), le rejet prime.
- `src/app/api/cron/google-status` : relit après le feed (06:00, ajouté à `vercel.json`)
  et rend les rejets **VISIBLES via Sentry** (`captureError`). Lecture seule, 0 migration.
- 15 tests (classify/summarize/pagination/garde anti-boucle/erreur propagée).

**Préparé + ESCALADÉ (gated, commit `cd74f3f`, 445 tests)** : persistance MARCHAND
des rejets (dashboard qualité) via `quality_alerts` type `google_disapproved`.
- Migration **106 idempotente NON APPLIQUÉE** (rollback + protocole §4 en tête).
- Cron écrit la table **uniquement si `GOOGLE_DISAPPROVAL_ALERTS=1`** (sinon l'INSERT
  casserait sur la contrainte tant que 106 n'est pas en prod — LESSONS 081/089).
  Dedupe vs alertes ouvertes + INSERT batchés (`chunk` 500).
- `buildDisapprovalAlerts` pur + 3 tests.
- **Escalade `logs/notify-extra.txt`** : `[DECISION]` appliquer 106+flag (option A) vs
  Sentry-only (B). Code+migration+tests prêts.

**Métrique** : 1 item Rang 1 `[R]` **fermé** (built+testé+en prod via Sentry) ; sa suite
gated **amenée au point de décision** (migration+code+tests prêts, GO escaladé). Aucun
garde-fou dur franchi. **PROCHAIN** (si run suivant) : Rang 1 `[R]` « Unifier store_code »
(Voie A `twostep-{id8}` vs Voie B `slug`) — réversible.

---

## 2026-06-19 · Enrichissement ④ (catégorie) — 1 fix silent-failure trouvé + 4 faux positifs écartés [RUN AUTONOME]

Backlog déjà traversé (entrées ci-dessous) → ce run RE-vérifie indépendamment qu'il
ne reste pas de réversible/testable (ne pas se fier à la conclusion du run précédent).
Agent Explore (très large) sur les helpers purs + chemins parse/ingest/enrichment →
7 findings candidats, **chacun vérifié dans le code réel** (zéro complaisance).

**1 bug RÉEL corrigé (commit `8f4a71e`, gate vert)** :
- **`categorizeProducts` (`src/lib/ai/categorize.ts`)** masquait une réponse IA malformée
  par un **`return []` silencieux**. Deux conséquences (mêmes classes déjà durcies ailleurs
  — parseJsonResponse, facture 0-item) : (a) `failed=0` reporté alors que N produits non
  catégorisés ; `ai_categorized_at` restant null → **RE-tentés à CHAQUE run en brûlant des
  tokens IA, indéfiniment et sans trace** (coût caché + dérive) ; (b) un JSON valide mais
  **non-tableau** (`{"error":...}`) passait `JSON.parse` puis **crashait le `for...of` du
  caller (hors try/catch) en TypeError NON catchée** → route entière down. Fix : helper pur
  `parseCategorizationResponse` (extrait, **0 test avant** sur ce hot path : cron enrich +
  sync POS + validation facture) qui **lève** sur non-JSON ET non-tableau → routé vers le
  `catch` existant du caller (failed += N + log). +1 fichier `tests/categorize-parse.test.ts`
  (5 cas). Impact CRITICAL (hub) mais **contenu** : seul caller direct = `categorizeMerchantProducts`,
  déjà try/catch. **422 → 427 tests, tsc OK.**

**4 findings de l'agent qui NE SONT PAS des bugs (vérifiés — pour ne pas les re-chasser)** :
- 🟢 **`ean/lookup.ts` Gemini/Anthropic `res.ok`** (l.226/257) : l'agent criait "manque res.ok
  avant json()" → **FAUX**, les 3 branches (Groq/Gemini/Anthropic) gardent déjà `if(res.ok)`.
- 🟢 **`google/merchant.ts:148`** : l'agent criait "json() avant ok" → **FAUX**, `if(!res.ok)`
  est testé EN PREMIER, body d'erreur parsé ensuite avec fallback `.catch(()=>({}))` + status.
- 🟢 **`ean/lookup.ts` `split(",")[0]`** (l.595…) : gardé par ternaire truthy ; seul un string
  à virgule de tête donnerait "" → edge pathologique, pas un défaut.
- 🟢 **parse qté divergence sur booléen `false`** + serper accept-on-error : edge quasi-impossible
  (XLSX/CSV ne produit pas de `false` JS) / safe-fail délibéré documenté. Laissés.

### 🏁 SURFACE RÉVERSIBLE CONFIRMÉE THIN (re-vérifiée indépendamment ce run)
Le précédent run disait "tout gated" ; je l'ai re-challengé → il restait **1** vrai item (ci-dessus),
désormais corrigé. Le reste = **faux positifs OU gated sur Thomas** (liste consolidée inchangée
ci-dessous : Google file-push, writes directs vs RPC 104, GREATEST delta, multi-tenant Lightspeed,
RLS — tous migration- ou design-/external-write-gated). **STOP evidence-based** (cf. LESSONS).

> ⚠️ Méta inchangée : **aucun lot encore relu par Thomas**. La vraie valeur restante est gated.

---

## 2026-06-19 · Exploitation — classification + BACKLOG ENTIÈREMENT TRAVERSÉ → STOP gated [RUN AUTONOME]

Dernière sous-étape du backlog. Recon de chaque volet → **aucun fix réversible/testable
neuf**, le reste est RAS ou gated. Honnêteté : on ne fabrique pas un fix là où le code est sain.

**Classement Exploitation (vérifié dans le code)** :
- 🟢 **① confidence** (`stock/confidence.ts`, `product-confidence.ts`) : RAS. Pur, raisonné,
  testé, et **renforcé indirectement ce run** (le fix source POS rend `storedSource` honnête).
- 🟢 **② cold-start** (`onboarding/cold-start.ts`) : RAS. Pur, simple, testé (seuil
  MIN_VISIBLE_FOR_READY=3, masquage carte). Rien à durcir.
- 🔴 **③ RLS** : durcissement = migration prod (garde-fou §4, supervisé).
- 🔴 **④ Canaux sortie — GAP RÉEL trouvé, design-gated** : `pushInventoryToGoogle` est appelé
  par le **sync POS + les 4 webhooks**, mais **PAS par `ingestStockSnapshot`** (le chemin
  file/token). Or ce chemin EST le mécanisme "feed Google LFP as a service" pour les marchands
  **sans caisse** (cœur du positionnement). Conséquence : (a) un marchand qui pousse son stock
  par fichier ne propage **jamais** à Google ; (b) un produit réconcilié à 0 garde **"in stock"
  sur Google** (faux positif — l'enjeu n°1). **Pourquoi je ne câble PAS unattended** : (1) effet
  EXTERNE sortant (écriture sous le compte Google du marchand) ; (2) le spec de design
  (`docs/superpowers/.../google-local-inventory-design.md`) ne liste PAS ce trigger → intention
  à clarifier (omission ou choix ?) ; (3) timing — l'enrichissement est async, les nouveaux
  produits sont `visible=false` jusqu'au worker (le filtre `.eq("visible",true)` les exclut déjà,
  mais le câblage mérite réflexion sur QUAND pousser). À cadrer avec Thomas.

### 🏁 BACKLOG PRÉ-AUTORISÉ (§5) — ENTIÈREMENT TRAVERSÉ
Collecte ③④⑤ · Triage · Enrichissement · Stockage · Exploitation : **chaque sous-étape est soit
corrigée+testée, soit n'a plus que des restes migration- ou design-gated** (listés ci-dessous).
**STOP evidence-based** (cf. LESSONS "rendement décroissant") : le réversible/testable est traité.

**RESTES GATED (consolidés — tous nécessitent Thomas)** :
- 🔴 **Canaux sortie : câbler `pushInventoryToGoogle` sur le chemin file-push** (+ réconciliation
  → "out of stock" Google). Effet externe + design. **Plus haute valeur produit restante.**
- 🔴 **Writes directs (sync/resync/file_push) bypassent la garde anti-régression 104** (seuls les
  webhooks passent par la RPC) → design + probable migration.
- 🔴 **Delta `GREATEST(v_prev_ts, p_source_ts)`** = migration prod (§4, supervisé).
- 🔴 **Scoping multi-tenant webhook Lightspeed** (perte de vente silencieuse) = design + migration.
  Interim sûr déjà posé (captureError).
- 🔴 **RLS** durcissement = migration.
- 🟡 Variantes orphelines (re-groupage sur édition EAN manuelle), câblage `parseCiiXml` Factur-X,
  STRICT_DECRYPT, clés API prod manquantes — cf. handoff §0ter.

**QUESTIONS / DÉCISIONS POUR THOMAS (relecture du lot — 3 commits ce run)** :
1. Valider ce lot Stockage+Exploitation (branche `feat/pipeline-v1-handoff-2026-06-12`, gate vert).
2. **Canaux sortie Google** : veut-on propager le stock file-push vers Google LFP ? (= cœur
   positionnement). Si oui, je câble `pushInventoryToGoogle` dans `ingestStockSnapshot` en supervisé.
3. Cadrer le routage des writes directs via la RPC 104 (anti-clobber) — design + migration.
4. Feu vert migrations gated (GREATEST delta, RLS) sous protocole §4.

---

## 2026-06-19 · Stockage — 2 fixes data-integrity (source POS + réconciliation) + non-bugs vérifiés [RUN AUTONOME]

Backlog suivant après Enrichissement → **Stockage** (① source/source_ts ② conflit
③ réconciliation ④ atomicité). Reconnaissance agent Explore → 5 findings candidats,
**chacun vérifié dans le code réel** (zéro complaisance : 2 vrais, 3 faux/low-value).

**2 bugs RÉELS corrigés (commits séparés, gate vert à chaque pas)** :
1. **Sync catalogue POS écrivait le stock SANS `source`** (`sync-engine.ts:203`). La
   migration 104 = `source NOT NULL DEFAULT 'manual'` → un stock issu d'une CAISSE
   (source la plus forte) retombait sur `manual` → `confidence.ts:65` l'affichait
   **"Stock probable" au lieu de "Disponible"**. C'était le SEUL writer à l'omettre
   (webhooks/untracked/resync/file_push déclaraient déjà). Helper pur `buildPosStockRows`
   (source="pos_sync", source_ts=updated_at) + 3 tests. Impact HIGH (hub sync) mais diff
   purement additif, cohérent avec les writers frères.
2. **Réconciliation : un seul `.in("product_id", toZero)`** (`snapshot.ts:250`) sur des
   milliers d'UUID → URL PostgREST de centaines de Ko → **échec EN BLOC** → faux "en
   stock" persistant (catalogue 10k ou push couvrant 60% > garde 50% → toZero ~4000).
   Fix : helper pur `chunk()` (lots de 500) + 4 tests. + write de zeroing déclare
   `source="file_push"` (104) + erreur `feed_events` n'est plus avalée (errors+captureError).

(415 → 422 tests, +7 ; tsc OK partout.)

**Findings de l'agent qui NE SONT PAS des bugs (vérifiés — pour ne pas les re-chasser)** :
- 🟢 **resync `source_ts=now()`** (resync-stock.ts:83) : PAS un bug. Le resync fait un upsert
  DIRECT (pas la RPC) → la garde 104 ne s'applique pas ; et `now()` est HONNÊTE (on vient
  d'observer la vérité absolue live). Le "fix" proposé (utiliser le `updated_at` POS périmé)
  ferait **rejeter** un resync par la garde si la ligne POS n'a pas bougé → **casserait
  l'auto-heal de dérive**. Surtout pas.
- 🟢 **snapshot `touched.add` après échec stock** : PAS un bug. Les `continue` (snapshot.ts:162,170)
  sautent `touched.add` (l.173) — l'agent a mal lu son propre extrait. Un produit dont le write
  stock échoue n'est PAS marqué touched (cohérent ; il sera re-traité au prochain push).
- 🟢 **resync boucle séquentielle (pas de batch)** : low-value, et le per-row donne la
  **granularité d'erreur** (writeErrors + captureError par produit) = feature anti-dérive
  silencieuse, pas un défaut. Batcher perdrait l'attribution. Laissé.

**Restes Stockage (gated, documentés)** :
- 🔴 **Writes directs (sync/resync/file_push) BYPASS la garde anti-régression 104** : seuls les
  webhooks passent par la RPC `update_stock_atomic`. Un file_push/resync périmé peut donc
  clobber une vérité webhook plus fraîche. Router ces writes via la RPC = changement de
  comportement + interaction avec la sémantique source_ts (file_push met now() → gagnerait
  toujours) = **design + probable migration**, hors petit pas réversible. À cadrer.
- 🔴 **Delta `GREATEST(v_prev_ts, p_source_ts)`** (déjà noté) = migration prod (§4, supervisé).

**PROCHAIN (backlog) = Exploitation** (① confidence — déjà vérifié RAS cette série ② cold-start
③ RLS — migration ④ canaux sortie app/LFP).

---

## 2026-06-19 · BILAN DE SESSION (run soutenu) — 6 fixes réels, cores vérifiés, STOP evidence-based [RUN AUTONOME]

**Ce run a infirmé la reco "pauser" du run précédent** : il restait du réversible à
forte valeur. Avancé dans l'ordre du backlog (⑤ → Triage → Enrichissement) :

**6 bugs RÉELS corrigés (chacun vérifié dans le code, gate vert + push à chaque pas)** :
1. parseCiiXml : décodage entités XML (D&G/H&M pollués) + prix 0 préservé.
2. Facture 0-item → statut "failed" (anti dérive silencieuse, 3 routes) + Sentry upload.
3. parseJsonResponse : JSON LLM vide/malformé → erreur explicite ; qté 0 / prix NaN.
4. spreadsheet : prix/qté 0 préservés + correction du piège `Number(null)===0`.
5. matching SKU insensible à la casse (anti-doublon) + 1er test match-product.
(396 → 415 tests, +19 ; tsc OK partout.)

**Cores VÉRIFIÉS SOLIDES ce run (pour ne pas les re-chasser)** :
- Confidence stock (`stock/confidence.ts`) : pur, raisonné, testé — RAS.
- Scoring cascade (`score-cascade.ts` combineTierScores/seuils) : RAS.
- Gate visibilité + multi-tenant scoping + reverse-search guard (Sprint 1.5) : RAS.
- Coûts Serper (run précédent) : bornés.

**STOP ici — décision EVIDENCE-BASED, pas un ressenti** (cf. LESSONS "rendement décroissant
non fiable") : le réversible/testable du backlog immédiat est traité ; **le reste a une
valeur réelle mais est GATED sur Thomas** :
- 🔴 **Scoping multi-tenant webhook Lightspeed** (perte de vente silencieuse possible) =
  design + probable migration. Interim sûr déjà posé (captureError au lieu de skip muet).
- 🔴 **Delta `GREATEST(v_prev_ts, p_source_ts)`** (Stockage, anti-régression fraîcheur delta)
  = migration prod (§4, supervisé).
- 🟡 Variantes orphelines sur correction EAN manuelle = design (re-groupage).
- 🟡 Câblage `parseCiiXml` dans `parseInvoice` (extraction XML PDF/A-3) = décision Factur-X.

**QUESTIONS / DÉCISIONS POUR THOMAS (relecture du lot)** :
1. Valider ce lot (8 commits, branche `feat/pipeline-v1-handoff-2026-06-12`).
2. Cadrer le fix multi-tenant Lightspeed (comment relier un webhook à son compte ?).
3. Feu vert migration GREATEST delta (je la ferai sous protocole §4 : branche test d'abord).
4. Priorité Factur-X : câbler le parseur CII (extraction PDF/A-3) ?

---

## 2026-06-19 · Triage — matching/dédup/gate/variantes : 1 fix réel + non-bugs VÉRIFIÉS [RUN AUTONOME]

Backlog suivant après ⑤. Reconnaissance agent Explore (gate score, matching, variantes)
→ 14 findings candidats, **chacun vérifié dans le code réel** (zéro complaisance).

**Bug RÉEL corrigé** :
- **`matchProduct` matchait le SKU sensible à la casse** (`bySku.set(p.sku)` / `get(candidate.sku)`)
  alors que l'EAN est canonique et le nom normalisé. Un article arrivant `REF-001` (CSV)
  puis `ref-001` (scan/POS) ratait le match → **doublon**. `snapshot.ts` lowercase déjà le
  SKU → asymétrie réelle entre les 2 chemins de matching. Fix : `.toLowerCase()` des deux
  côtés. `match-product.ts` (2 appelants : sync POS + validation facture) n'avait **AUCUN
  test** → +1 fichier (5 cas). 415/415, tsc OK, commit + push.

**Findings de l'agent qui NE SONT PAS des bugs (vérifiés — pour éviter de les re-chasser)** :
- 🟢 **available_sizes inclut qty=0** : PAS un bug. Le champ porte la quantité par taille et
  TOUS les consommateurs filtrent `qty>0` à la lecture (`product-detail.tsx:132`,
  `api/products/available-sizes:36`). Filtrer au write serait cosmétique/destructeur
  (retire l'info « M — épuisé » qu'un front pourrait vouloir griser).
- 🟢 **gate `review_status=null` → visible** : design-INTENT explicite (NULL = legacy/default
  validated). Les nouveaux produits POS sont `pending_review` (non null) donc protégés.
  Le changer masquerait en masse les produits legacy → **design-gated, NE PAS toucher seul**.
- 🟢 **seuil fuzzy 0.7** + heuristique de containment : la pondération longueur (min/max) borne
  déjà les faux positifs ; les faux NÉGATIFS (dédup ratée) sont moins nocifs qu'une fusion à
  tort. Changer le seuil = tuning à valider sur données réelles, pas un fix unattended.
- 🟢 **multi-tenant** (EAN/SKU/name) : scopé `merchant_id` partout (vérifié). OK by design.

**Restes Triage (gated, documentés)** :
- 🟡 Variantes orphelines si l'EAN d'un principal est corrigé à la main (variant_of non re-groupé) :
  exige une logique de re-groupage sur édition manuelle = design, hors petit pas.
- 🟡 available_sizes file vs POS : le garde anti-écrasement existe ; la perte de granularité
  si le POS porte une taille structurée est un edge case design.

**PROCHAIN (backlog) = Enrichissement** (déjà vérifié SAIN pour les coûts Serper le 2026-06-19 ;
les autres volets cascade/file/worker à revoir si valeur réelle, sinon Stockage/Exploitation).

---

## 2026-06-19 · Collecte ⑤ — factures/scan : 4 fixes data-integrity + CLÔTURE [RUN AUTONOME]

Reprise dans l'ordre du backlog (③④ traités, restes gated) → première sous-étape
NON entamée = **Collecte ⑤ (factures/scan)**. Reconnaissance via agent Explore puis
**chaque finding vérifié dans le code réel** (plusieurs claims de l'agent étaient faux).

**4 bugs RÉELS corrigés (commits séparés, gate vert à chaque pas)** :
1. **`parseCiiXml` (Factur-X, réception oblig. sept. 2026)** : champs extraits par
   regex **non décodés** → toute marque avec `&` (Dolce&Gabbana, H&M — obligatoirement
   `&amp;` en XML valide) stockée polluée → casse affichage + matching. + prix `0.00`
   attesté → `null`. Fix : `decodeXmlEntities` (anti double-décode) + préserve 0. +3 tests.
2. **Facture 0-item → statut `"parsed"`** (3 routes : email Resend, email Cloudflare,
   upload manuel) = dérive silencieuse (marchand croit à un import réussi). Fix : helper
   pur `invoiceStatusForParse` → 0 item = `"failed"` (valeur déjà au CHECK 003, ux_status
   "refused" via 068 → **aucune migration**). + `captureError` sur échec upload storage
   (avant : `console.error` perdu en serverless). **Vérifié : PAS d'orphelin DB** (record
   créé APRÈS upload — l'audit se trompait). +2 tests.
3. **`parseJsonResponse`** (LLM claude/gemini/spreadsheet, **0 test avant**) : `JSON.parse`
   sans try/catch → réponse vide/non-JSON = SyntaxError opaque → 500. Fix : erreurs
   explicites. + qté `0` explicite → 1 (fantôme) et prix NaN remonté tel quel → null. +8 tests.
4. **`spreadsheet.ts`** (même famille "perte du 0") : `parsePrice()||null` détruisait un
   prix 0 ; `Number()||1` un qté 0. Fix + **correction d'une régression latente que
   j'avais introduite** en (3) : `Number(null)===0` → garde sur la valeur brute. +1 test.

**Testé** : 396 → **410** tests, tsc OK, gate vert à chaque commit, push SSH sans skip.

### 🏁 COLLECTE ⑤ — CLÔTURÉE (périmètre réversible/testable)
**Restes NON traités (justifiés, pas du laisser-aller)** :
- 🟡 **Scan : code invalide ignoré silencieusement** (`scan/session.ts:35`) = préoccupation
  **UI/UX** (bip/flash caméra, là où le code brut est dispo), PAS logique. Changer le modèle
  `ScanSession` serait spéculatif sans voir le consommateur React → **design/UI-gated**.
- 🟡 **`parseCiiXml` n'est pas encore branché** dans `parseInvoice` (extraction XML depuis
  PDF/A-3 = étape amont absente ; `einvoice.ts` throw "Available 2027"). Le parseur est durci
  et testé, prêt au câblage. Décision de câblage = Thomas (priorité Factur-X).
- 🟡 Header tableur cherché sur 30 lignes → au-delà, fallback LLM (coût/latence, pas une perte
  de donnée). Élargir = risque de faux header. Laissé.

**PROCHAIN (backlog) = Triage** (① identité GTIN/SKU ② gate score ③ matching/dédup ④ variantes).

---

## 2026-06-19 · Enrichissement — VÉRIF crédits Serper (crainte Thomas) : SAIN, 0 fix [RUN AUTONOME]

**Question (crainte explicite de Thomas)** : un produit déjà validé est-il re-vérifié par
Serper (gaspillage de crédits payants) ?

**Vérifié (chaîne complète) → NON, c'est bien borné** :
- `resolveAndEnrich`/`lookupEan` passent par le cache `ean_lookups` ; `searchEanByName`
  est caché ; un EAN déjà résolu ne re-tape pas les sources externes.
- Les `enrichment_jobs` sont enfilés **par ingestion** (snapshot.ts), PAS en récurrence
  sur les produits validés. Le sync n'enrichit que les `newlyCreated`.
- Cron `enrich-products` : `MAX_ATTEMPTS=3` + `claim_enrichment_jobs` **incrémente
  `attempts`** (migration 100 l.42) → un produit non résolu est retenté **3× max** puis
  `failed`. Donc **≤ ~3 requêtes Serper par produit, jamais en boucle**.

**Conclusion** : contrôle des coûts Serper SAIN. **Aucun changement de code** (zéro
complaisance : on n'invente pas un fix là où le code est correct). Run = vérification.

> ⚠️ Méta : beaucoup de passes autonomes enchaînées cette nuit, **aucune relue par
> Thomas**. Les prochains runs entrent en rendements décroissants (vérif de code déjà
> solide). La vraie valeur restante est **gated sur Thomas** : (1) fix multi-tenant
> webhook, (2) delta GREATEST (migration), (3) relire le lot. Recommandation : **pauser
> la tâche** (`Disable-ScheduledTask -TaskName TwoStepAutonomy`) jusqu'à sa relecture,
> ou me pointer une priorité précise.

---

## 2026-06-19 · Collecte ④ — ingestion fichier : parsing prix robuste [RUN AUTONOME]

**Trouvé (perte de donnée silencieuse)** : 2 sites (`ingest/parse-stock.ts:86`,
`parser/spreadsheet.ts:217`) parsaient le prix via `Number(String(x).replace(",","."))`
→ un prix avec **séparateur de milliers** (`1 234,56 €`, `1.234,56`, `1,234.56`) →
`NaN` → **prix PERDU** (silencieusement) pour tous les articles > 1000 € (mobilier,
high-tech, mode haut de gamme).

**Fait** : helper partagé `src/lib/parser/parse-price.ts` (DRY) robuste FR/EN —
retire devise + espaces (insécables inclus), gère deux séparateurs (le plus à droite =
décimal), single-séparateur (≤2 déc = décimal, 3 déc/multiples = milliers).
Conservateur (null si non finançable, bornage >0/<100k laissé au caller → pas de faux
positif). Câblé dans les 2 sites. +6 tests.

**Testé** : 396/396, tsc OK, gate vert. Commit + push.

**Reste (mineur)** : `validEanOrNull` possiblement orphelin (consolidation 2 utils GTIN,
supervisé) ; robustesse encodage CSV exotique. Sinon ingestion fichier = solide.

---

## 2026-06-19 · Collecte ④ — ingestion fichier : cohérence EAN cross-canal [RUN AUTONOME]

(Collecte ③ restant = migration/design-gated → saut au backlog suivant, règle AUTONOMY.md §5.)

**Trouvé (incohérence cross-canal)** : le triage fichier (`src/lib/ingest/triage.ts`)
utilisait `validEanOrNull` (valide le checksum mais **garde l'UPC-12 en 12 chiffres**),
alors que le chemin POS utilise `canonicalizeEan` (**UPC-12 → EAN-13** préfixe 0). →
le même produit ingéré par fichier vs caisse aurait **deux EAN différents** → échec de
`matchProduct`/`groupVariantsByEAN` (doublons cross-canal).

**Fait** : triage bascule sur `canonicalizeEan` (forme canonique unique partout). EAN-13/
EAN-8 inchangés ; UPC-12 désormais normalisé en EAN-13 ; GTIN-14 traité comme le POS
(→ identité SKU, pas GTIN — cohérent). +1 test (UPC-A `036000291452` → `0036000291452`).

**Testé** : 390/390, tsc OK, gate vert. Commit + push.

**Reste / prochaines passes (ingestion fichier)** : revoir parsing prix avec séparateur
de milliers (`1 234,56` / `1.234,56` → NaN actuellement) ; robustesse encodage CSV exotique.
Mineurs. `validEanOrNull` (src/lib/ean/validate.ts) possiblement orphelin désormais — à
vérifier/consolider avec `canonicalizeEan` en supervisé (2 utils GTIN dupliqués).

---

## 2026-06-19 · Collecte ③ — passe 3 : interim SÛR du bug multi-tenant (perte rendue visible) [RUN AUTONOME]

**Fait (réversible, sans migration)** : créé `src/lib/pos/resolve-product.ts`
(`pickUniqueProduct` pur + `resolveWebhookProduct`) et câblé dans **les 4 routes
webhook** (square/shopify/lightspeed/zettle). Désormais, si un `pos_item_id` matche
**plusieurs marchands** (collision multi-tenant, cf. passe 2), on **ne choisit plus au
hasard** : `captureError` (Sentry) + vente non appliquée → la perte devient **VISIBLE**
au lieu d'être silencieuse. 0 match = skip normal (inchangé), 1 match = inchangé.
+4 tests (`tests/pos-resolve-product.test.ts`).

**Testé** : 389/389, tsc OK, gate vert. Commit + push.

**Ce N'EST PAS le fix de fond** (toujours à cadrer avec Thomas) : scoper le lookup par
`merchant_id` via une association webhook→compte (Lightspeed surtout) = design + probable
migration → garde-fou. L'interim empêche juste l'application au mauvais marchand ET la
disparition silencieuse. Le delta `GREATEST(source_ts)` (passe 1) reste migration-gated.

---

## 2026-06-19 · Collecte ③ — passe 2 : bug MULTI-TENANT trouvé, run arrêté (À CADRER) [RUN AUTONOME]

> Ce run autonome s'est arrêté SANS commit (jugement correct : le reste est
> guardrail/design-gated). Il avait omis de committer son analyse → capturée ici
> manuellement + **vérifiée dans le code** (pas juste sa déclaration).

**🔴 BUG MULTI-TENANT VÉRIFIÉ (silent sale loss)** : les 4 routes webhook résolvent le
produit par `.from("products").eq("pos_item_id", X).single()` **sans scoper par
`merchant_id`** (ex. `api/webhooks/lightspeed/route.ts:50-54`, même pattern Square/
Shopify/Zettle). Or `pos_item_id` n'est PAS unique globalement : les `itemID`
**Lightspeed sont par compte** → 2 marchands Lightspeed partageant `itemID="5"` →
`.single()` matche 2 lignes → renvoie `null` → `if(!product) continue` → **la vente est
perdue silencieusement pour les DEUX** (aucune erreur loggée). Square/Shopify/Zettle ont
des IDs quasi-globaux → collision peu probable en pratique ; dégâts bornés par le resync
absolu 6 h. Mais c'est une **faille de design multi-tenant** réelle.

**À CADRER AVEC THOMAS (pas en unattended)** :
- **Fix propre** = associer chaque webhook à son marchand/compte (Lightspeed : mapper
  l'account du webhook → la `pos_connection`), puis scoper le lookup par `merchant_id`.
  Design + probable migration/index → garde-fou.
- **Interim SÛR (réversible, sans migration)** : remplacer le skip silencieux par un
  `captureError` quand le lookup échoue/est ambigu → rend la perte VISIBLE (principe
  "pas de dérive silencieuse"). Faisable en supervisé.

**Aussi en attente (passe 1)** : delta `GREATEST(v_prev_ts, p_source_ts)` côté RPC =
**migration prod** (garde-fou §4). Le reste de Collecte ③ = migration- ou design-gated.

**Aucun garde-fou dur franchi. Notif envoyée (chemin "aucun commit").**

---

## 2026-06-19 · Collecte ③ — passe 1 (webhooks : fraîcheur source_ts + anti-dérive) [RUN AUTONOME]

**Trouvé (angle mort / bug de dérive réel)** : la migration 104 a ajouté à
`update_stock_atomic` une **garde anti-régression** sur le mode ABSOLU — refuse
d'écraser une vérité plus fraîche par une plus ancienne (`IF p_source_ts < v_prev_ts
RETURN`). **Mais cette garde était INERTE** : les 4 routes webhook appelaient
`updateStockAtomic(...,"webhook")` SANS passer `sourceTs` → `source_ts` retombait sur
`now()` (heure de réception serveur), jamais l'heure réelle de l'événement. Or les 4
`parseWebhookEvent` calculent déjà le vrai timestamp (`calculated_at` Square,
`timestamp` Zettle, `timeStamp` Lightspeed, order Shopify) dans `updated_at` — il était
simplement jeté. Conséquence concrète : sur Square/Zettle (absolu), deux webhooks livrés
**dans le désordre** (Square ne garantit pas l'ordre ; retries tardifs) → le périmé
arrivant en dernier avait un `now()` plus récent → **il gagnait → régression du stock**.
Idem cohérence webhook↔resync : les deux écrivaient `now()`, donc « dernier arrivé gagne »
sans ordre réel.

**Fait** : les 4 routes webhook passent désormais `update.updated_at` comme 6ᵉ arg
(`sourceTs`) à `updateStockAtomic`. Absolu (Square/Zettle) → garde 104 enfin active
(anti-dérive out-of-order). Delta (Shopify/Lightspeed) → `source_ts` = heure de vente
au lieu de l'heure de réception → confidence « vu il y a X » honnête. Aucune migration
(la garde existait déjà en prod, juste alimentée correctement). +1 fichier de test
`tests/pos-webhook-parse.test.ts` (8) : verrouille que les 4 adapters reportent quantité
ET vrai timestamp dans `updated_at` (couche `parseWebhookEvent` jusqu'ici **non testée**).

**Testé** : 385/385 (+8), tsc OK, gate vert. Commit + push.

**Reste / prochaines passes Collecte ③**
- 🟡 **Limite résiduelle (delta + retry tardif)** : pour le mode delta, un webhook livré
  très en retard fixe `source_ts` en arrière (régresse la fraîcheur affichée). Le fix
  propre = `GREATEST(v_prev_ts, p_source_ts)` côté RPC delta → **migration prod** (garde-fou
  §4, supervisé). Pas en unattended. Faible enjeu (retry delta = rare).
- 🟡 **Idempotence asymétrique** : Shopify/Lightspeed ont la table `webhook_events`
  (critique en delta : double-application = double décrément) ; Square/Zettle non (absolu
  = naturellement idempotent). Défendable, mais à confirmer comme choix explicite.
- 🟡 Sémantique `feed_events` Lightspeed (toujours "sale" ; le bloc notify restock est mort
  car Lightspeed n'émet que des deltas négatifs) — cosmétique.

**🔴 TROUVÉ (bug multi-tenant réel, NON corrigé — design en attente Thomas)** : les 4
routes webhook matchent le produit par `products.pos_item_id` **sans scoping marchand**
(`.eq("pos_item_id", …).single()`). Or l'index est composite `(merchant_id, pos_item_id)`
(migration 020) → `pos_item_id` **n'est PAS unique globalement**. Square (catalog_object_id),
Shopify (variant_id), Zettle (UUID) ont des IDs globalement uniques → OK. **Lightspeed**,
lui, a des `itemID` = entiers séquentiels **par compte** → deux marchands Lightspeed
partagent `itemID="5"` → `.single()` matche 2 lignes → erreur PostgREST → `product=null` →
`continue` → **vente silencieusement perdue pour les deux** (le resync 6 h limite la casse
en stock, mais le décrément est perdu en attendant). Pourquoi je NE corrige PAS en unattended :
le fix correct = scoper par marchand, ce qui exige que le webhook sache à quel **compte
Lightspeed** il appartient (association webhook→merchant aujourd'hui absente) → **décision
de design + probablement migration/index**, hors « petit pas réversible testable ». À cadrer
avec Thomas : comment relier un webhook Lightspeed à son marchand (account ID dans le
payload ? URL de webhook par-marchand avec token ?). Exposition actuelle faible (peu de
marchands Lightspeed), mais c'est de la **perte de données silencieuse** = enjeu n°1 produit.

**Décision autonome (honnêteté)** : je m'arrête ici sur Collecte ③. Les items restants sont
soit migration-gated (delta `GREATEST` source_ts, §4 supervisé), soit design-gated (scoping
multi-tenant ci-dessus), soit cosmétiques/refactor (déjà jugé « risque > valeur » en
unattended, cf. Collecte ② passe 5). Empiler un changement non testé dans un chemin chaud
(webhook) sans relecture servirait moins le projet que ce point d'arrêt propre + vérifié.

---

## 2026-06-19 · Bascule autonomie soutenue — validation PAR LOTS + Collecte ③ autorisée

**Décidé (Thomas)** : autonomie locale ~13 runs/jour (tâche Windows toutes les 75 min,
7j/7). Routines/Remote Control abandonnés (ne marchaient pas chez lui).

**Changement de méthode** : pour que les runs produisent, passage de « validation à
chaque sous-étape » → **validation par lots**. L'agent est pré-autorisé à enchaîner le
backlog du plan de revue : **Collecte ③ → ④ → ⑤ → Triage → Enrichissement → Stockage →
Exploitation**, une à la fois, commit par petit pas. Thomas relit ≥1×/jour.
Garde-fous durs (migration/merge/email/dépense) + gate tests vert obligatoire = inchangés.
MAJ : `AUTONOMY.md §5`, prompt de `scripts/autonomy-run.ps1`.

**PROCHAIN TRAVAIL = Collecte ③** (chemin stock : mapping quantités, fraîcheur,
cohérence webhooks/getStock, dérive). Collecte ② est close (5 passes, voir plus bas).

---

## 2026-06-18 · Collecte ② — passe 5 (bornes de pagination) + CLÔTURE [RUN AUTONOME]

**Trouvé (angle mort unattended)** : aucune borne de pagination. Si une API renvoie le
même curseur/page_info en boucle (anomalie), `getCatalog` bouclait à l'infini → un run
cloud unattended **hang + brûle le quota** (coût caché). Réel pour l'autonomie.

**Fait** : `catalogPageLimit()` (défaut 2000, réglable `POS_MAX_CATALOG_PAGES`) + compteur
de pages qui lève au dépassement, sur Shopify/Square getCatalog, Square fetchPromos,
Lightspeed getCatalog. (Zettle = fetch unique, pas de pagination.) +1 test.

**Testé** : 377/377, tsc OK, gate vert. Commit + push.

### 🏁 COLLECTE ② — CLÔTURÉE (du solide, on ne révise plus)
5 passes, gate vert à chaque fois, zéro garde-fou franchi. Couvert :
- ✅ **Robustesse réseau** : retry 429/5xx + Retry-After (4 POS, catalog & stock).
- ✅ **Gestion d'erreurs** : getCatalog/getStock lèvent sur non-OK (anti catalogue-fantôme
  + anti stock-partiel-silencieux), double sécurité `computeOrphanProductIds` (garde anti-vide).
- ✅ **Pagination** : bornée (anti boucle infinie).
- ✅ **Mapping** : EAN canonicalisé+validé (checksum GTIN, UPC-12→EAN-13) — 4 POS.

**Décision autonome (honnêteté)** : je NE démarre PAS Collecte ③ seul — c'est une
nouvelle sous-étape qui requiert la validation de Thomas (AUTONOMY.md §5). Et je NE fais
PAS le refacto `Account.json` de Lightspeed en unattended : faible valeur (DRY pur) +
sémantiques d'erreur divergentes (throw vs lenient) + zéro couverture de test sur
pushCatalog/fetchPromos → risque de régression mal relue > bénéfice. À faire en supervisé.

**EN ATTENTE DE THOMAS** :
1. Valider Collecte ② comme terminée.
2. Feu vert pour Collecte ③ (chemin stock : mapping quantités, fraîcheur, webhooks).
3. (optionnel) refacto Account.json Lightspeed, en supervisé.

---

## 2026-06-18 · Collecte ② — passe 4 (EAN canonicalisé sur les 4 adaptateurs) [RUN AUTONOME]

**Trouvé (angle mort mapping)** : les 4 adaptateurs **n'utilisaient pas** `canonicalizeEan`
(`src/lib/identifiers/validators.ts`) — dont la doc impose pourtant « à utiliser
SYSTÉMATIQUEMENT sur tout EAN reçu d'un POS/CSV/scan ». Conséquences : Shopify/Lightspeed
stockaient des codes non-GTIN comme EAN (aucune validation) ; Square/Zettle faisaient un
format-check sans checksum ; **personne ne canonicalisait UPC-12 → EAN-13** → un même
produit scanné UPC-12 sur une caisse et EAN-13 sur une autre ne se regroupait pas.

**Fait** : branché `canonicalizeEan` sur l'EAN des 4 getCatalog (Square, Shopify,
Lightspeed, Zettle). Désormais : checksum GTIN validé (code non-GTIN → null, cohérent
avec le gate « zéro faux positif »), et UPC-12 normalisé en EAN-13 (regroupement
cross-source correct). Source unique, DRY.

**Testé** : +1 test (rejet barcode non-GTIN → null) + fixture passée à un EAN-13 valide.
376/376, tsc OK, gate vert. Commit + push.

**Collecte ② — bilan**
- ✅ Pagination / erreurs / **robustesse réseau** (retry 429/5xx + getCatalog/getStock
  durcis, anti catalogue-fantôme) sur les 4 POS.
- ✅ **Mapping EAN** canonicalisé+validé sur les 4 POS.
- 🟡 Reste UNIQUEMENT (refacto trivial, pas un bug) : factoriser le fetch `Account.json`
  répété dans Lightspeed (getCatalog/getStock/fetchPromos/pushCatalog). Optionnel.
- → **Collecte ② est solide.** Prochaine sous-étape logique : **Collecte ③** (le chemin
  stock — getStock mapping/quantités/fraîcheur — déjà partiellement durci ici), à valider
  par Thomas avant de s'y engager.

---

## 2026-06-18 · Collecte ② — passe 3 (retry + durcissement sur les 4 adaptateurs) [RUN AUTONOME]

**Fait** (run autonome, réversible)
- Câblé `fetchWithRetry` sur tout le reste : **Lightspeed** (getCatalog Account+Item,
  getStock Account+ItemShop, fetchPromos), **Zettle** (getCatalog, getStock),
  **Shopify** (getStock variants + inventory_levels). Robustesse 429/5xx/réseau
  désormais sur **les 4 adaptateurs**, getCatalog ET getStock.
- **Durci `getStock`** (lève sur non-OK au lieu d'un stock partiel silencieux) :
  Lightspeed (Account + ItemShop), Shopify (variants + inventory_levels). Sûr car
  resync-stock (try/catch → "getStock_failed") et sync-engine (try/catch → "error")
  attrapent. Lightspeed `getStock` valide aussi `accountID` désormais.
- fetchPromos Lightspeed : reste **lenient** (retour [] sur échec) — promos non
  critiques ne doivent jamais faire échouer la sync.
- Tests : +3 (Shopify/Lightspeed getStock lèvent) dans pos-catalog-robustness.

**Testé** : 375/375, tsc OK, gate vert (~6 s). Commit + push.

**Reste Collecte ② (mineur, mapping/refacto — prochaine passe)**
- 🟡 Uniformiser la validation EAN (digits) Shopify (`variant.barcode`) + Lightspeed
  (`item.upc`) via un helper partagé (Square/Zettle valident déjà). Mapping-quality.
- 🟡 Factoriser le fetch `Account.json` répété dans Lightspeed (getCatalog/getStock/
  fetchPromos/pushCatalog) — refacto, pas un bug.
- ✅ Pagination / gestion d'erreurs / robustesse réseau = SOLIDES sur les 4 POS.

**Note** : je m'arrête ici (point propre, pas de garde-fou franchi) plutôt que d'empiler
des diffs non relus. Reprise possible sur les 2 items 🟡 mineurs.

---

## 2026-06-18 · Collecte ② — passe 2 (back-off 429/5xx) + refus Hermès/Norton

**Refusé (sécurité)** : Thomas (en partant) a demandé de « contourner Norton pour
télécharger/installer Hermès Agent et tout configurer avec, en autonomie ». REFUSÉ :
contourner l'AV pour installer un binaire tiers sur une machine à secrets prod, en
autonomie non supervisée, = risque de compromission majeur et irréversible. De plus
**redondant** : Routines (natif cloud Anthropic) fait le job, sandboxé. Décision laissée
à Thomas à son retour ; proposé d'évaluer Hermès en lecture seule (jamais via bypass AV).

**Fait (vrai travail réversible, dans le cadre AUTONOMY.md)**
- `src/lib/pos/fetch-retry.ts` : `fetchWithRetry` — retry 429 + 5xx + erreur réseau,
  respecte `Retry-After`, back-off exponentiel plafonné + jitter, `sleep`/`jitter`
  injectables. Réglable en ops via `POS_RETRY_MAX_RETRIES` / `POS_RETRY_BASE_MS` /
  `POS_RETRY_MAX_MS` (lus à l'appel).
- Câblé : `squareFetch` (chokepoint → couvre catalogue+stock+promos Square) et
  Shopify `getCatalog` (le plus exposé au 429, limite 2 req/s).
- Tests : `tests/pos-fetch-retry.test.ts` (11) + ajustement des 2 tests passe 1
  (POS_RETRY_MAX_RETRIES=0 pour tester la propagation d'erreur instantanément).

**Testé** : 372/372, tsc OK, gate vert (~5 s). Commit + push.

**Reste / prochaine passe Collecte ②**
- 🟡 Câbler `fetchWithRetry` dans Lightspeed (getCatalog/getStock/fetchPromos),
  Zettle (getCatalog/getStock), et Shopify `getStock` — même bénéfice retry.
- 🟡 Uniformiser la validation EAN (digits) Shopify/Lightspeed (cf. passe 1).
- 🟡 Factoriser le fetch `Account.json` répété 4× dans Lightspeed.
- 🟡 Durcir `getStock` Shopify/Lightspeed (res.ok) comme getCatalog.

---

## 2026-06-18 · Collecte ② — getCatalog : passe 1 (anti « catalogue fantôme »)

**Trouvé (bug critique data-integrity)**
- `getCatalog` de **Shopify** (shopify.ts) et **Lightspeed** (lightspeed.ts) ne
  vérifiaient pas `res.ok`. Sur 429 (rate-limit Shopify 2 req/s) / 5xx / 401, ils
  renvoyaient `[]` **silencieusement**. En aval, sync-engine masque tout produit
  absent du catalogue → **une erreur réseau transitoire effaçait TOUTE la vitrine
  du marchand**. C'est le mode d'échec « catalogue fantôme » qui a tué les
  concurrents (MVMS, Milo). Square et Zettle, eux, levaient déjà correctement.

**Fait (double sécurité)**
1. Shopify + Lightspeed `getCatalog` lèvent désormais sur réponse non-OK (sync
   marquée "error" + watchdog `pos_disconnected`, au lieu d'un faux catalogue vide).
2. Extrait `computeOrphanProductIds()` (sync-engine, exporté, pur) avec **garde
   anti-vide** : si le catalogue courant est vide, on ne masque RIEN (ceinture+bretelles
   même si un futur adapter régressait).
3. Tests : `tests/pos-catalog-robustness.test.ts` (8 tests : lève sur 429/500/503,
   parse OK, garde anti-vide).

**Testé** : 361/361 (+8), tsc OK, gate vert. Commit + push.

**Reste / prochaine passe Collecte ②**
- 🟠 Aucune gestion 429 / back-off (Retry-After) dans les `fetch` adapters (Shopify
  surtout). Robustesse à ajouter (helper `fetchWithRetry` partagé) — PROCHAINE PASSE.
- 🟡 EAN non validé (digits) côté Shopify (`variant.barcode`) et Lightspeed (`item.upc`)
  alors que Square/Zettle valident — incohérence (le triage aval rattrape, mais à
  uniformiser).
- 🟡 Lightspeed refait un fetch `Account.json` dans 4 méthodes (getCatalog/getStock/
  fetchPromos/pushCatalog) — 4 points d'échec, à factoriser.
- 🟡 getStock Shopify/Lightspeed : même classe que #critique (pas de res.ok partout) —
  à durcir (mais moins catastrophique : qty=0 mitigé par untracked→1).

---

## 2026-06-18 · Sous-étape 0quater — AUTONOMIE HEADLESS OPÉRATIONNELLE ✅

**Les deux ❌ sont levés.**
- Thomas a réglé Norton (inspection des connexions chiffrées). Re-test : `claude -p "say OK"`
  → **OK / exit 0 sans contournement TLS**. Headless débloqué.
- Chaîne complète validée bout-en-bout : Tâche Windows → PowerShell → `claude` → OK/exit 0
  (smoke en 11 s).
- Tâche **`TwoStepAutonomy`** enregistrée (State=Ready), jours ouvrés 10h07/14h07/18h07,
  `-StartWhenAvailable`, timeout 2 h, `MultipleInstances=IgnoreNew`. Persiste aux reboots
  → **règle aussi le « durable cross-session »**. Lance `scripts/autonomy-run.ps1`.

**Récap mécanismes d'autonomie — état final**
| Mécanisme | État |
|---|---|
| Headless `claude -p` (Claude fermé) | ✅ |
| Tâche Windows persistante (cross-session, reboots) | ✅ |
| Autonomie session ouverte (cron + /loop) | ✅ |
| Plugin sécurité Sage (garde-fou agent) | ✅ (actif au redémarrage Claude Code) |
| git HTTPS→SSH (contourne Norton si réactivé) | ✅ |

**Pour retirer/pauser l'autonomie headless** :
`Unregister-ScheduledTask -TaskName TwoStepAutonomy -Confirm:$false`
ou `Disable-ScheduledTask -TaskName TwoStepAutonomy`.

**⚠️ Garde-fou collision** : si une session Claude travaille en même temps qu'un run
planifié, possible conflit de push (non-fast-forward, se règle par pull/retry). Pour la
1re passe Collecte ②, la faire supervisée AVANT que le planificateur tourne à froid.

**PROCHAIN = travail produit réel : Collecte ② (sync catalogue initial).**

---

## 2026-06-18 · Sous-étape 0ter — Cause headless CONFIRMÉE + Sage installé

**Fait**
- Installé le plugin sécurité **Sage** (`sage@sage` v0.10.0, Gen Digital) — vérifié
  légitime (ADR, garde-fou agent). Actif au prochain redémarrage de Claude Code.
- Posé `git config --global url."git@github.com:".insteadOf "https://github.com/"`
  → tous les clones GitHub HTTPS passent en SSH (débloque `claude plugin install` et
  tout clone à travers Norton).

**Trouvé (diagnostic certain)**
- `NODE_TLS_REJECT_UNAUTHORIZED=0 claude -p "say OK"` → **répond OK instantanément**.
  Donc le blocage headless = **100 % Norton** (interception TLS du CLI vers l'API
  Anthropic). Norton IPS `nllbIDSAgent` toujours Running, `SSLKEYLOGFILE` toujours
  injecté. Pas de CA Norton trouvable dans les magasins (interception re-signée).

**Décidé** (Thomas) : voie **propre** — exclure node/claude de Norton (pas de TLS-off).

**Préparé, prêt à lancer dès Norton réglé**
- `scripts/autonomy-run.ps1` (wrapper headless, mode propre, log dans logs/).
- `scripts/register-autonomy-task.ps1` (tâche Windows TwoStepAutonomy, jours ouvrés
  10h07/14h07/18h07). La tâche persiste aux reboots → règle aussi le « durable cron ».

**Reste (Thomas)** : faire la manip Norton (exclure node.exe + claude.exe de
l'inspection HTTPS / Intrusion Prevention, OU désactiver l'inspection des connexions
chiffrées), puis redémarrer le terminal. Ensuite je re-teste `claude -p` et je lance
`register-autonomy-task.ps1` → vraie autonomie headless opérationnelle.

---

## 2026-06-18 · Sous-étape 0bis — Mécanisme d'autonomie : ce qui marche / ne marche pas

**Testé en réel (pas de promesse en l'air)**
- ❌ **Headless `claude -p` (Claude fermé)** : se fige, aucune sortie ni en nesting ni
  en tâche Windows autonome (timeout 120-150 s, log bloqué sur START). → la vraie
  autonomie « pendant que Claude est fermé » **n'est PAS opérationnelle aujourd'hui**.
- ❌ **Cron durable cross-session** : `CronCreate durable:true` retombe en *session-only*
  sur cette build → meurt à la fermeture de la session.
- ✅ **Autonomie en session ouverte** : fonctionne (cron `595970d2` fire les jours
  ouvrés 9-18h quand la session est au repos ; et /loop sur demande).

**Hypothèse principale du blocage headless** (incertaine, à confirmer) : Norton 360
(`aswidsagent`, Intrusion Prevention) intercepte le TLS du CLI `claude.exe` vers l'API
Anthropic — même cause racine que git/node. L'app desktop marche car elle gère TLS
autrement (Electron, CA embarquée). Si vrai : régler Norton débloque headless ET MCP.

**Plan** : Thomas exclut node/git/claude de l'inspection TLS Norton → on re-teste
`claude -p` → si vert, on planifie la vraie autonomie headless. En attendant : session
ouverte + cron session + /loop.

**État réaliste de l'autonomie** : « avance pendant mes journées de travail » = OUI tant
qu'une session Claude Code reste ouverte. « avance Claude fermé » = bloqué sur le bug
`claude -p`, à débloquer via Norton puis re-test.

---

## 2026-06-18 · Sous-étape 0 — Mise en place de l'autonomie (infrastructure)

**Fait**
- Diagnostiqué le `git push` cassé : **NetLimiter** (`nllMonFltProxy`, `SSLKEYLOGFILE`)
  intercepte le TLS, CA racine non approuvée → `schannel: SEC_E_UNTRUSTED_ROOT`.
- Basculé git en **SSH** (clé ed25519 sans passphrase, ajoutée sur GitHub par Thomas).
  Push réseau OK, MITM contourné.
- Rendu le **gate pre-push déterministe** : `test:run` exclut `tests/db/**` (réseau live) ;
  tests live isolés dans `npm run test:db` (`vitest.config.db.ts`).
- Écrit `docs/AUTONOMY.md` (contrat d'autonomie : garde-fous, protocole migration,
  seuil de validation, politique emails, mécanisme cron + /loop).
- Mis à jour `LESSONS.md` (entrée NetLimiter, ancienne entrée `--use-system-ca` périmée).

**Trouvé**
- Les 7 tests « en échec » étaient 100 % environnementaux (TLS NetLimiter), zéro
  régression de code. 353/353 tests déterministes verts.

**Décidé** (en autonomie, réversible)
- SSH plutôt que bricoler le TLS de NetLimiter (plus robuste pour les pushs auto).
- Isoler les tests live du gate plutôt que les supprimer (ils restent en CI).

**Testé**
- `npm run test:run` → 353 passed, sans réseau. `tsc` → OK.
- Push **sans** `SKIP_PRE_PUSH` réussi (hook complet vert) : preuve canal autonome.

**Reste / questions en attente (Thomas)**
1. **Politique emails** : confirmer le défaut prudent (§6 AUTONOMY) ou autoriser l'envoi
   de TOUT en autonomie ?
2. **NetLimiter** : désactiver l'inspection TLS / whitelister node+git ? (sinon risque
   d'échec réseau sur cron de nuit — appels MCP/API).
3. **Cron headless** : feu vert pour le planifier (avance le réversible quand tu es absent) ?

**Prochaine sous-étape produit** : Collecte ② — sync catalogue initial (getCatalog des
4 POS : pagination, gestion d'erreurs, mapping des champs, robustesse).

---

## 2026-06-26 — PHASE E E4 : écran « Validation du catalogue enrichi » honnête (load + actions)

**Fait** (commit `1d950ec`, branche `feat/pipeline-v1-handoff-2026-06-12`)
- Sourcing §6 : backlog → PHASE E (mission [R] in-scope de Thomas 2026-06-24). Maillon E non
  couvert le plus prioritaire = `dashboard/stock/review` (review enrichissement). E1/E3 faits.
- **Bug réel n°1 (faux-vide au chargement)** : `ReviewPage` (Server Component) faisait
  `const { data: products }` (error JETÉ) → blip/500 DB → `products=null` → `?? []` →
  EmptyState « Rien à valider ». Aggravé : `pending_review` invisible en vitrine (089/094) →
  l'écran ment « rien à valider » → fiches jamais validées = catalogue muet en silence.
  Fix : helper PUR `deriveReviewView` (`src/lib/stock/review-view.ts`, `error|ready{counts,filtered}`),
  page distingue erreur/vide (captureError + `loadError`), `ReviewTable` rend erreur honnête
  (`role="alert"` + Réessayer).
- **Bug réel n°2 (faux succès d'action, HIGH SF-hunter, LESSON E1)** : `bulkValidate/validateOne/
  rejectOne` ne vérifiaient pas `res.ok` + `router.refresh()` inconditionnel → un 500 sur /validate
  rafraîchissait l'UI comme si validé (fiche reste pending = invisible, 0 signal). Fix : wrapper
  `runAction` (refresh QUE sur `res.ok`, sinon `actionError` role=alert ; sélection conservée sur
  échec/vidée sur succès ; catch → captureError).
- **+3 adjacents** : merchant SELECT error tracée (sauf PGRST116) ; pos_connections error tracée ;
  PostgrestError → forward `code/message/details` en contexte Sentry.

**Testé** : `npx tsc --noEmit` OK ; `npm run test:run` → **881 passed** (875→881, +6 dont la
RÉGRESSION load-échoué→error≠empty, compteurs stables au changement de bucket, statut hors-bucket→
pas de NaN). 2 revues silent-failure-hunter **SOUND** (chargement + delta actions). 0 migration.

**Pré-existant hors scope (noté, pas fait)** : `auth.getUser()` double-destructure non gardée
(classe codebase-wide présente sur de nombreuses pages → pass dédié, pas ce run ciblé).

**Scorecard** : Preuve 7/10 · Sécu north-star 8/10 · Réversibilité 10/10 · Scope 9/10 · Align 8/10.
2 bugs réels (faux-vide + faux succès), 4 fichiers. CFR 10 runs ≈ 80 % OK (2 échecs = runs
rate-limit/interrompus du 23/06, 0 revert).

**Reste maillon E** : rendu VISUEL/responsive (Thomas + `ui-journey.mjs`) + dernier écran (onboarding).

## 2026-06-29 — MAILLON 9 (d) : mapping catégorie EAN anglais → taxo FR (allow-list)

**Sourcing (§6)** : backlog → PRIORITÉ N°1 maillon 9 enrichissement. (a)(b)(c) faits ; prochaine
sous-tâche [R] in-scope unit-testable = (d) mapping catégorie anglais→taxo FR.

**Signal réel (pas devinette)** : requête PROD sur `products.category` non-slug-FR →
`"clothing and fashion"` ×2, `"toys"` ×2, `"home and garden"` ×1. Les 7 produits du test 27/06
inspectés : 2/7 ont `category_id` (AI : Bose→tech-electronique, Carhartt→mode) ; 5/7 portent la
catégorie EAN anglaise brute. Cause : `applyEnrichment` (lookup.ts:862) écrivait `data.category`
VERBATIM — les sources EAN renvoient leur propre taxo anglaise, pas nos 15 slugs FR L1 (migration 041).

**Fait** (commit `9bea56d`)
- Fonction PURE `mapEanCategoryToFr` (`src/lib/ean/category.ts`) : allow-list label EN/FR → slug FR L1,
  inconnu/ambigu → null (zéro invention = north-star, même principe que brand.ts (c)). Passthrough
  idempotent si déjà un slug FR (categorize.ts en écrit). Normalise & vs and, virgules, casse, `\p{Mn}`.
  `FR_L1_SLUGS` = source unique des 15 slugs ; test verrouille « n'émet jamais un slug hors taxo ».
- Câblé dans `applyEnrichment` (caller unique `lookupEan`, blast LOW) : map d'abord, n'écrit que si
  non-null ET `!prod.category_id` (l'AI categorize reste autoritaire ; EAN = fallback).
- **Finding CRITIQUE revue corrigé** : chemin JUMEAU `invoices/[id]/validate` (route.ts:347) prenait
  `eanData.category` brut → INSERT verbatim → produits facture en anglais alors que les enrichis-EAN en
  FR (même champ, incohérent). Mappé là aussi (classe LESSON « garde incohérente sur chemins jumeaux »).

**Preuve (sans yeux)** : `tests/lib/ean/category.test.ts` (+10, **923→933**) = fixture des 3 labels
PROD réels + variantes d'orthographe (& vs and, virgules, casse) + ambigus (games/office/personal
care)→null + inconnu→null + idempotence des 15 slugs FR + invariant taxo. `npx tsc` OK.

**Revue silent-failure-hunter SOUND** : core sound, strict non-régression vs ancien comportement
(inconnu : avant=anglais verbatim, après=null→AI categorize remplit ; rien ne lit `products.category`
en exigeant l'anglais ou un always-set). Slugs vérifiés vs migration 041 (15/15 exacts). Finding LATENT
noté hors scope : `multi-source.ts canonical_category` brut — AUCUN writer DB actif (cascade-suggest =
suggestion admin retournée, cascade-engine n'écrit pas la catégorie) → pas durci (zéro busywork).

**Limite assumée (honnêteté)** : le mislabel SOURCE (Coca→home&garden) n'est PAS un bug de mapping —
on traduit fidèlement. Le vrai fix d'un label source faux = le chemin AI (lit le nom « Coca-Cola
Original Taste » → alimentation), inerte en prod faute de clés GROQ/GEMINI (escaladé X).

**Métrique** : maillon 9 (a)(b)(c)(d) unit-testables COMPLETS. Reste maillon 9 = e2e photo vrais EAN
(env live, escaladé) + clés AI categorize (env X). 1 item [R] in-scope fermé.

**Scorecard** : Preuve 7/10 (signal prod réel + fixture, mais sortie finale non re-vérifiée en réel —
pas de clés AI/env live) · Sécu north-star 8/10 (SF-hunter SOUND, 0 faux positif, non-régression) ·
Réversibilité 10/10 (0 migration, `git revert`) · Scope 9/10 (1 lib + 2 wirings + 1 test, 4 fichiers) ·
Align 9/10 (catégorie exacte FR = data exacte, cœur enrichissement priorité n°1). 1 bug réel (anglais
verbatim) + 1 jumeau (validate). 4 fichiers. tests 923→933.

## 2026-06-30 — SCALE/VOLUME : anti-troncature `max-rows` PostgREST sur l'ingestion

**Sourcing (§6)** : maillon 9 (a)(b)(c)(d) + images OBF/OPF COMPLETS (loop-doable épuisé ; reste e2e
photo + clés AI = escaladé X). Prochain [R] in-scope = FILTRE DE CAP #4 **SCALE/VOLUME** (« prochain [R] »,
Deerskin = milliers de SKU). Premise vérifiée dans le code réel AVANT (LESSONS ~70% findings faux).

**Signal/premise vérifié (pas devinette)** : `grep .range(` → AUCUNE pagination dans google/ingest. Les 2
lectures de `ingestStockSnapshot` (`snapshot.ts:118` index produits existants + `:297` lecture stock-en-cours
réconciliation) sont `.select().eq()` non bornées. PostgREST tronque SILENCIEUSEMENT à 1000 lignes (défaut
Supabase `max-rows`), sans erreur. Vérifié : **0 contrainte UNIQUE sur `products(merchant_id, ean)`** (seul
`slug` unique, migration 012) → la troncature de l'index → produits >1000ᵉ vus « nouveaux » → **DOUBLONS**.
Lecture stock tronquée → vendu au-delà du 1000ᵉ (absent du push) jamais remis à 0 = **faux « en stock »** (n°1).
Invisible sur petites fixtures (tous les maillons prouvés <100 produits), mord à l'échelle pilote.

**Fait** (branche `feat/pipeline-v1-handoff-2026-06-12`)
- Helper `fetchAllRows(makeQuery, pageSize=1000)` (`src/lib/supabase/paginate.ts`) : pagine `.range()` jusqu'à
  une page < pageSize, contrat retour identique `{data,error}`. Erreur 1re page→propagée ; **fail-loud** sur
  `data=null` sans erreur (anomalie SDK → erreur synthétique, jamais index vide masqué / set partiel en succès).
- Câblé sur les 2 lectures de `snapshot.ts` avec `.order("id")`/`.order("product_id")` = ordre DÉTERMINISTE
  entre pages (anti-gap concurrent, indépendant du verrou). Sémantique d'erreur préservée (existingErr→throw,
  inStockErr→captureError+skip).

**Preuve (méthode §1bis, field-level)** : `tests/lib/supabase/paginate.test.ts` (+10 : complétude 2500 lignes/
3 pages, multiple exact, page unique, vide, erreur page 1 ET page N, null-page→erreur, pageSize invalide).
`tests/ingest-snapshot-pagination.test.ts` (+4) : 1500 produits, faux client stateful qui PLAFONNE à 1000 sans
`.range` (simule PostgREST) → push 1499/1500 → **0 doublon** (`products_created=0`, table reste 1500) + **#1200
vendu (ligne >1000ᵉ) remis à 0** (`stock_zeroed=1`), produits poussés gardent leur qté. Régression réelle :
sur l'ancien code non borné, le faux client renverrait 1000 → ~499 doublons + #1200 jamais zéro → tests rouges.

**Revue silent-failure-hunter** : 4 findings. **HIGH** (sync_lock faux pour `/api/catalog/import`) → déjà
préempté en ajoutant `.order()` (le reviewer le recommande comme « seule garantie sûre vu 2 call sites »).
**MED** (null-page N>0 = set partiel en succès) + **LOW** (`?? []` no-op silencieux) → corrigés par le fail-loud
(null→erreur → les 2 appelants lèvent/skip). **LOW** couverture failure-path → test null-page ajouté. 0 silent-
failure introduit ; au contraire CLÔT la perte silencieuse n°1 à l'échelle.

**Métrique** : `tsc` OK, `test:run` **945→959** (+14). 1 unité [R] in-scope avancée (scale-ingest). **Reste (prochain
[R], même helper, mécanique)** : 4 lectures produits des sorties Google (Voie A/B/preview/inventory) = même
troncature non bornée (un feed >1000 omet silencieusement le reste, parité à préserver) ; puis mémoire `lfp-xml`
50k en RAM + timeouts Vercel. 0 migration, réversible.

**Scorecard** : Preuve 8/10 (intégration field-level à l'échelle sur faux client fidèle, mais synthétique — 0
marchand réel >1000) · Sécu north-star 8/10 (SF-hunter, 4 findings traités, clôt la perte n°1) · Réversibilité
10/10 (0 migration, `git revert`) · Scope 9/10 (1 prod + 1 helper + 4 fakes + 2 tests = 8 fichiers, 1 unité) ·
Align 9/10 (pilier 1 « ne rien oublier » à l'échelle, dé-risque le pilote Deerskin). 2 bugs réels (index→doublons,
réconciliation→vendu-non-zéro). 8 fichiers. tests 945→959. CFR 10 runs = 100% (0 revert).

## 2026-06-30 (run #2) — SCALE/VOLUME : feed XML LFP (Voie B) en STREAMING (mémoire bornée)

**Sourcing (§6)** : backlog → FILTRE DE CAP #4 SCALE, item explicitement nommé « prochain [R] » après
scale-ingest + scale-google-out : **mémoire `lfp-xml` (TOUT le XML construit en RAM sur 50k items)**.
Premise vérifiée dans le code réel AVANT (LESSONS ~70% findings faux) : la route `feed/lfp/[merchantId]`
faisait `fetchAllRows` (matérialise tout le tableau produits) **puis** `buildLfpXml` = `.map().join("")`
(matérialise la chaîne XML entière) → sur 50k items, tableau produits + tableau d'items + chaîne jointe
résidents simultanément.

**Fait** (branche `feat/pipeline-v1-handoff-2026-06-12`)
- `lfp-xml.ts` : `buildLfpXml` scindé en pièces pures `lfpXmlHead`/`lfpXmlItem`/`lfpXmlTail` (source UNIQUE
  du format) ; `buildLfpXml` les recompose → **byte-identique sur feed non vide** (vérifié : le `\n` qui
  séparait les items via `join` devient le suffixe de chaque `lfpXmlItem`). Filtrage d'éligibilité déplacé
  DANS `lfpXmlItem` (même `isFeedEligible`/`gtinOnlyTierEnabled` → parité de gate avec Voie A préservée).
- `paginate.ts` : nouveau `streamRows` (async generator) — pagination LAZY (`.range()` page par page,
  mémoire = 1 page), **fail-loud par THROW** (≠ `fetchAllRows` qui rend `{data,error}`) car un consommateur
  streaming a déjà émis des octets → il doit AVORTER, jamais finir « complet ». Erreur page → throw
  (`.cause` = PostgrestError, diagnostic préservé) ; `data=null` sans erreur → throw.
- route `feed/lfp/[merchantId]` : ÉMET en flux. Peek de la 1re page dans un try/catch AVANT la Response
  (erreur 1re page → vrai **500** propre, rien émis) ; puis `ReadableStream` enqueue head → items page par
  page → tail. Erreur sur une page ULTÉRIEURE → `captureError` + `controller.error` → **transfert HTTP
  avorté** (Google voit une réponse interrompue, re-crawle) au lieu d'un 200 « complet » silencieusement
  tronqué = **l'invariant north-star** (un feed partiel crawlé = perte silencieuse n°1). `revalidate=900`
  + `Cache-Control s-maxage=900` inchangés → cache CDN par URL préservé (le streaming borne la RAM origine,
  pas la cacheabilité).

**Preuve (méthode §1bis, field-level)** : `tests/lib/supabase/paginate.test.ts` (+8 streamRows : pages lazy
[1 page lue par `.next()`], 2500/3 pages, multiple exact→page vide finale, vide→[[]], throw sur erreur page
N, `.cause` préservé, throw sur null-page, pageSize invalide). `tests/feed-lfp-stream.test.ts` (+4, drive le
VRAI GET) : 2500 produits → **2500 `<item>` en flux** + 3 `.range()` [0..999][1000..1999][2000..2999] ;
catalogue vide → feed valide sans `<item>` ; **erreur 1re page → 500 propre** ; **erreur page ultérieure →
`res.text()` REJETTE** (corps avorté, jamais 200 tronqué complet) + captureError step `stream-products`.

**Revue silent-failure-hunter** : north-star **SOUND** (peek-500, abort mid-stream, parité gate, pagination,
format non-vide byte-identique tous vérifiés). 1 finding actionnable (**LOW**) corrigé : si `captureError`
lève (service report HS), `controller.error` n'était pas atteint → flux pendant ; enveloppé en `try/finally`
→ l'abort s'exécute toujours. Finding cosmétique (feed VIDE : une ligne blanche en moins) sans impact
(XML ignore le whitespace inter-éléments ; `buildLfpXml` n'est plus appelé par la route).

**Métrique** : `tsc` OK, `test:run` **963→975** (+12). 1 unité [R] in-scope avancée (scale-feed-xml-stream).
Blast LOW (seul consommateur prod de `buildLfpXml` = cette route ; cron = Content-API JSON). 0 migration,
réversible. **Reste SCALE (prochain [R])** : timeouts crons/routes Vercel sur gros catalogues (la Voie A cron
`google-feed` + l'ingestion bouclent N produits ⇒ durée ~max Vercel) ; batch upserts stock de l'ingestion
(upserts par produit en boucle). Voie A cron pourrait aussi streamer/chunker via `streamRows`.

**Scorecard** : Preuve 8/10 (route réelle drivée field-level + abort mid-stream prouvé sur faux client fidèle,
mais synthétique — 0 feed réel 50k) · Sécu north-star 9/10 (SF-hunter SOUND + finding corrigé ; invariant
anti-troncature renforcé, pas affaibli, par le streaming) · Réversibilité 10/10 (0 migration, `git revert`) ·
Scope 9/10 (2 prod + 1 helper + 2 tests = 5 fichiers, 1 unité) · Align 9/10 (pilier 1 « ne rien oublier » à
l'échelle, dé-risque le pilote Deerskin = milliers de SKU). 1 bug (finally abort). 5 fichiers. tests 963→975.
CFR 10 runs = 100% (0 revert).

## 2026-07-01 (run autonome) — SCALE/VOLUME : cron `google-feed` (Voie A) borné au budget temps Vercel (anti-troncature silencieuse)

**Sourcing (§6)** : backlog → FILTRE DE CAP #4 SCALE, item explicitement nomme « prochain [R] » apres
scale-feed-xml-stream : **timeouts crons/routes Vercel sur gros catalogues (Voie A cron `google-feed` boucle
N produits)**. Premisse verifiee dans le code reel AVANT (LESSONS ~70% findings faux) : le cron pousse TOUS
les produits de TOUS les marchands en UNE invocation via N `await googleMerchantFetch` SEQUENTIELS, sans
`maxDuration` ni borne de temps (contraste avec `enrich-products` qui pose maxDuration=300 + draine un BATCH).

**Le silent-failure ciblé** : sur un catalogue pilote multimarque (Deerskin = milliers de SKU), N x ~100-300 ms
peut depasser le budget Vercel -> fonction TUEE en plein vol. Les produits deja pousses le sont, le reste OMIS,
**et l'ecriture `last_feed_status` (fin de boucle) JAMAIS atteinte** -> le marchand reste sur le « success » du
run precedent = troncature SILENCIEUSE, aucun statut « partial », aucun Sentry = perte n1.

**Fait** (branche feat/pipeline-v1-handoff-2026-06-12)
- NOUVEAU helper PUR `src/lib/google/feed-push.ts` : `processWithinTimeBudget(items, action, {now, deadlineMs})`
  -> `{succeeded, attempted, interrupted}`. Horloge + action INJECTEES (zero dep reseau/DB) -> deterministe.
  Verifie l'horloge AVANT chaque item (un item entame est mene a terme, jamais coupe en plein appel reseau).
- `cron/google-feed/route.ts` : `export const maxDuration = 300` (budget Fluid max) + `TIME_BUDGET_MS = 270_000`
  (30 s de marge sous maxDuration pour ecrire les statuts + repondre). `deadlineMs = Date.now()+budget`. Garde en
  tete de boucle marchand (ne demarre pas un marchand qu'on ne finira pas). Push borne via le helper. Statut
  HONNETE distinguant interrompu (budget) vs partial (echecs push) vs success. Reponse expose `merchants_attempted`
  + `time_budget_exhausted`. Sentry `step:"time-budget"` sur toute interruption (« catalogue trop gros -> chunking »).

**Preuve (methode §1bis)** : `tests/lib/google/feed-push.test.ts` (+6 : succes complet, vide!=interruption,
succes/echecs comptes a part, STOP au deadline `>=` boundary attempted<total, deadline deja passe avant 1er item,
item entame mene a terme). `tests/google-feed-time-budget.test.ts` (+3, drive le VRAI POST avec `Date.now` spie
qui avance a chaque push) : budget non atteint->success ; budget depasse en plein marchand->statut "partial"
HONNETE (PAS "success") + `time_budget_exhausted:true` + 3 appels reseau seulement (pas 5) ; marchand suivant
NON demarre + signale Sentry.

**Revue silent-failure-hunter** : 3 findings, **2 corriges** : (1 MED) les 3 `.update` de statut avalaient leur
`error` -> helper `writeMerchantStatus` (captureError sur echec d'ecriture = le faux-success re-introduit PAR LE
CHEMIN WRITE est ferme) ; (3 LOW-MED) Sentry ne tirait pas sur le pilote MONO-marchand interrompu
(`merchantsAttempted===length`) -> condition elargie a tout `budgetExhausted`. (2 LOW : sortir le write de statut
de `getGoogleAccessToken` multi-caller) = SKIP scope (rate Low, DB correcte, hors-cap). Paths SOUND verifies :
faux-success sous interruption impossible (interrupted=>attempted<length=>partial), boundary `>=` correct,
productsErr/null-products throw intacts, per-product captureError visible.

**Metrique** : `tsc` OK, `test:run` **975->984** (+9). 1 unite [R] in-scope avancee (scale-google-feed-timeout).
Blast LOW (cron = entry-point sans caller interne ; helper = 1 caller ; aucune signature existante changee).
0 migration, reversible. **Reste SCALE (prochain [R])** : batch upserts stock de l'ingestion (upserts par produit
en boucle dans le snapshot) ; chunker la boucle produits du cron via `streamRows` pour finir un catalogue > budget
en un run (auj. : honnete mais la queue tail ne se publie qu'au prochain run).

**Scorecard** : Preuve 8/10 (route reelle drivee field-level + interruption prouvee sur faux client fidele, mais
synthetique — 0 catalogue reel) · Secu north-star 9/10 (SF-hunter 2 findings corriges, clot la troncature
silencieuse + le faux-success du chemin write) · Reversibilite 10/10 (0 migration, `git revert`) · Scope 9/10
(1 prod route + 1 helper + 2 tests = 4 fichiers, 1 unite) · Align 9/10 (pilier 1 « ne rien oublier » a l'echelle,
de-risque le pilote Deerskin). 2 bugs (faux-success write-path, Sentry mono-marchand). 4 fichiers. tests 975->984.
CFR 10 runs = 100% (0 revert).

---

## 2026-07-01 (run autonome #3) — SCALE : batch des UPDATE de produits PRE-EXISTANTS (re-push quotidien)

**Contexte / signal** : suite directe du "Reste (prochain [R], meme theme SCALE)" note par le run batch
precedent. La refonte batchee de `ingestStockSnapshot` (run #2, 984->997) avait batche les CREATIONS mais
laisse les produits PRE-EXISTANTS en `.update()` PAR PRODUIT dans la boucle. Or le modele NearSt = snapshot
POUSSE PERIODIQUEMENT (quotidien) -> au 2e push et suivants, TOUS les SKU sont pre-existants -> la voie
d'UPDATE etait 100% sequentielle = O(N) aller-retours reseau sur un catalogue pilote (Deerskin = milliers de
SKU) -> budget temps Vercel depasse -> fonction TUEE -> ingestion tronquee SILENCIEUSEMENT (meme classe de
perte n1 que les creations, deja fermee). C'etait le TROU SYMETRIQUE, et le cas COMMUN (re-push > premier push).

**Fait** (branche feat/pipeline-v1-handoff-2026-06-12)
- Les MAJ metadonnee (prix/tailles) des produits pre-existants sont DIFFEREES : la boucle pousse
  `{id, name, updates}` dans `productUpdates` (ne planifie QUE les colonnes reellement presentes -> jamais
  `price:null` qui ecraserait un prix inchange). Le STOCK (donnee critique) + `touched` restent poses dans la
  boucle, INDEPENDAMMENT -> un echec de MAJ au flush ne peut jamais exclure le produit de `touched`
  (invariant F2 : reconciliation ne le zeroise jamais -> pas de faux "rupture").
- Flush (nouvelle etape 2, avant stock) : GROUPAGE PAR FORME de colonnes (`price` / `available_sizes` / les
  deux) puis `upsert(payload, {onConflict:"id"})` par lots de 500 par groupe. Le groupage par forme EST ce
  qui evite le piege du batch naif : dans un upsert PostgREST une colonne absente d'une ligne est mise a NULL
  (union des colonnes du corps) -> melanger `{price}` et `{available_sizes}` NULLERAIT le prix du 2e. Un
  groupe = colonnes uniformes -> jamais de null injecte. L'upsert ne touche QUE ses colonnes (DO UPDATE SET)
  -> name/visible/review_status/ean/sku intacts.
- SURETE ligne concurremment supprimee : `products.merchant_id` ET `name` sont NOT NULL (migration 001) -> un
  INSERT partiel (pas de conflit) violerait NOT NULL -> le lot ECHOUE (jamais de resurrection en ligne
  partielle) -> REPLI mono-ligne `.update().eq(id)` (no-op sur ligne absente), isolant la faute comme les
  creations ; captureError phase "update-product" preserve.
- Borne : O(N/500) upserts au lieu de O(N) `.update()` sequentiels -> un re-push de 50k SKU passe de ~50k
  round-trips a ~100 lots -> tient sous les 300 s Vercel.

**Preuve (methode 1bis)** : `tests/ingest-snapshot-batching.test.ts` (9->11 tests). (a) re-push 1200 produits ->
`products_upsert===3` (ceil(1200/500)) et `products_update===0`, JAMAIS 1200 `.update()` (non-vacant : l'ancien
code par-produit ferait 1200 appels). (b) NOUVEAU test null-overwrite : faux client etendu pour modeler
FIDELEMENT la null-fill union-de-colonnes de PostgREST ; re-push mixte {prix seul}+{tailles seules} -> les 2
formes dans des groupes SEPARES (2 upserts) -> le produit dont le fichier n'a PAS de prix garde son prix (8,
JAMAIS nulle) et le produit sans taille garde ses tailles. Sans groupage le test echouerait. (c) F2 preserve
(echec MAJ -> stock ecrit + pas zeroise).

**Revue silent-failure-hunter** : diff **SOUND** sur tous les invariants coeurs (F4-F9 confirmes : decouplage
F2, garde null-fill reelle+testee, dedup intra-push preserve, phase Sentry preservee, ordre FK sur). 3 findings
tous PRE-EXISTANTS (non introduits par ce diff) : **F1 (MED) CORRIGE dans ce commit** = le write stock=0 de la
reconciliation (LE plus critique : passage a "epuise") faisait `errors.push` SANS `captureError` -> seul angle
mort Sentry de la fonction (un produit vendu reste affiche "en stock" et l'ops ne le voit jamais) ; ajout
`captureError` phase "reconcile-stock-zero" + test de regression (faux client `failZero` -> produit NON
zeroise, errors + Sentry). F2 (LOW, `products_updated` gonfle par alias intra-push) = encode comme attendu
dans les tests -> decision produit, laisse en suivi. F3 (LOW, echec `groupVariantsByEAN` non ajoute a errors[])
= post-pass non bloquant delibere, laisse en suivi.

**Metrique** : `tsc` OK, `test:run` **997->999** (+2 : null-overwrite guard + regression F1). 1 unite [R]
in-scope avancee (scale-ingest-update-batch) + 1 silent-failure MED adjacent ferme. Blast LOW
(`ingestStockSnapshot` = 2 callers POST, signature/retour inchanges). 0 migration, reversible. Fichiers : 2
(snapshot.ts + le test). **Reste SCALE (prochain [R])** : chunker/streamer la boucle produits du cron
`google-feed` via `streamRows` pour finir un catalogue > budget en UN run (auj. la queue tail ne se publie
qu'au prochain run). Suivis non bloquants : F2 (metric alias) + F3 (errors groupVariants) = decisions produit.

**Scorecard** : Preuve 8/10 (faux client fidele a la null-fill PostgREST + borne O(N/500) non-vacante + F2
preserve, mais synthetique - 0 catalogue reel) · Secu north-star 9/10 (SF-hunter SOUND sur le diff + F1 MED
adjacent ferme = angle mort Sentry du write le plus critique comble ; 0 faux positif introduit) · Reversibilite
10/10 (0 migration, `git revert`) · Scope 9/10 (1 prod + 1 test = 2 fichiers, 1 unite) · Align 9/10 (pilier 1
"ne rien oublier" a l'echelle sur le cas COMMUN = re-push quotidien, de-risque le pilote Deerskin). 1 bug reel
adjacent (F1 Sentry blind spot). 2 fichiers. tests 997->999. CFR 10 runs = 100% (0 revert).
