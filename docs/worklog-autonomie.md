# Worklog autonomie — Two-Step

Journal des sous-étapes menées en autonomie. Le plus récent en haut.
Format par entrée : date · sous-étape · fait · trouvé · décidé · testé · reste / questions.

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
juste des tests. **PROCHAIN [R]** : rendre `pushInventoryToGoogle().catch(()=>{})` visible
(captureError) dans les 4 webhooks (MEDIUM, réversible, vérifiable) — finding de la revue.
Le haut du backlog (Rang 0-2) reste gated/externe (merge, migrations, design multi-tenant).

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
