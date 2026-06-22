# LESSONS — Erreurs récurrentes et solutions

Ce fichier est la mémoire long-terme de Claude Code sur ce projet.
À consulter au début de chaque session et avant toute tâche similaire à une entrée existante.

## Format
Chaque entrée : contexte minimal, erreur faite, solution correcte, date.

## Supabase
(vide — à remplir au fil de l'eau)

## Sécurité
- ❌ `decrypt()` fail-open silencieux (`if (!ciphertext.includes(":")) return ciphertext;`) acceptait n'importe quel token non-chiffré sans erreur. Risque : fuite Vercel env = fuite TOUS tokens POS marchands. Fix : versioning format `v1:iv:tag:ciphertext` + flag `STRICT_DECRYPT=true` qui throw au lieu de fail-open. Migration tokens DB obligatoire AVANT activation strict via `scripts/migrate-encrypt-tokens.mjs`. Rollout 5 phases : déploy fix transitoire → migrate DB → audit Sentry → set STRICT → redeploy. Branche `fix/encryption-fail-open` (2026-04-25)

## Ops / résilience (V3, 2026-06-13)
- ❌ `instrumentation.ts` sans `export const onRequestError = Sentry.captureRequestError` → les crashs non catchés des Server Components / route handlers ne remontent JAMAIS à Sentry. Ajouté.
- ❌ `resync-stock` écrivait `last_sync_status:"ok"` même quand des upserts stock échouaient (`if(!error) updated++` avalait l'erreur) → dérive de stock derrière un voyant vert. Fix : captureError par échec + statut "partial" si writeErrors>0.
- ❌ `google-feed` : token Google expiré → `errors++; continue` silencieux (feed mort sans signal) ; et poussait TOUS les produits du marchand (pas de filtre visible/validated) = produits non identifiés sur Google Shopping. Fix : statut "error"+Sentry sur token absent, gate `visible+validated+!archived+!variant` sur le SELECT, statut "partial" si pushed<eligible.
- ⚠️ `STRICT_DECRYPT=true` PAS activable tel quel : 1 token legacy (non `v1:`) dans `pos_connections` → throw au décryptage = POS down. Migrer via `scripts/migrate-encrypt-tokens.mjs` AVANT activation. (0 token POS dans merchant_pos_credentials, 0 Google.)
- Backup DB : `.github/workflows/db-backup.yml` (pg_dump quotidien → artefact 30j). Nécessite le secret GitHub `SUPABASE_DB_URL` (connection directe port 5432, pas le pooler).

## OAuth caisses (POS) — revue Collecte ① (2026-06-17)
- ❌ `state` OAuth signé HMAC mais SANS expiration ni anti-rejeu → un state capturé est rejouable indéfiniment. Fix : timestamp signé + rejet >10 min (state-token.ts) + tests.
- ❌ Lightspeed `exchangeCode` ne vérifiait pas `res.ok` → `expires_in` undefined → `new Date(NaN).toISOString()` crash / token vide stocké comme valide. Fix : garde res.ok + access_token + défaut expires_in.
- ❌ Shopify `exchangeCode` POSTait le `client_secret` vers `https://${shop}/...` sans valider `shop` → SSRF/fuite secret. Fix : regex `^[a-z0-9][a-z0-9-]*\.myshopify\.com$`.
- ✅ CORRIGÉ (2026-06-17, finalisation OAuth) : scope Lightspeed → `employee:inventory_read` (moindre privilège, lecture catalogue+stock) ; refresh dédupliqué via `ensureFreshAccessToken` (le sync FAISAIT déjà le refresh — c'était de la DUPLICATION, pas un trou ; l'audit s'était trompé, vérifié) ; HMAC Shopify du callback vérifié (`verifyShopifyOAuthHmac`) ; watchdog reconnexion (quality-check → alerte `pos_disconnected` si last_sync_status='error', migration 105).
- ⏳ STRICT_DECRYPT : code prêt, **bloqué par 1 token legacy = connexion Square du compte "Two-Step Test"**. Activable après suppression de ce test + set env Vercel prod. Décision Thomas (ne pas supprimer sa connexion de test sans accord).
- ⚠️ NB config externe : changer le scope Lightspeed dans le code exige que l'app OAuth enregistrée chez Lightspeed autorise `employee:inventory_read` (console dev Lightspeed) — à vérifier avant la 1re connexion réelle.

## Next.js / Vercel
- ❌ `vercel env add` par stdin PowerShell enregistre des valeurs VIDES (et l'argument positionnel est refusé par CLI ≥54.13) → utiliser `--value` ou l'API REST (`POST /v10/projects/{id}/env?upsert=true`, token dans `%APPDATA%\xdg.data\com.vercel.cli\auth.json`). Vérifier avec `vercel env pull` + longueur des valeurs. (2026-06-13)
- ❌ Script npm `prepare` (`git config core.hooksPath`) casse `npm install` sur Vercel (pas de .git en build CLI) → wrappé dans node try/catch. (2026-06-13)
- ❌ **NetLimiter** (`nllMonFltProxy`, var `SSLKEYLOGFILE`) intercepte le TLS sortant ; sa CA racine n'est dans aucun magasin → git (`schannel: SEC_E_UNTRUSTED_ROOT`) ET node (`unable to verify the first certificate`, même avec `--use-system-ca`) cassent par intermittence. Fixes durables : (1) git en **SSH** (`git@github.com:...`, clé ed25519 sans passphrase, NetLimiter ne touche pas le port 22) ; (2) gate pre-push **déterministe** = `test:run` exclut `tests/db/**` (réseau live) → tests live isolés dans `npm run test:db` (vitest.config.db.ts), à lancer en CI. Vraie correction de fond = désactiver l'inspection TLS de NetLimiter ou whitelister node/git. (2026-06-18)

## Sécurité RLS (audit 2026-06-13)
- ❌ Tester une protection sur une base sans données = faux négatif. La RLS `products`/`stock`/`merchants` était `USING(true)` (001 jamais resserrée) ; le test anon renvoyait `[]` UNIQUEMENT car 0 produit `visible=false` n'existait. Toujours croiser test live + lecture du code + raisonnement sur l'état futur (1er marchand avec pending/masked = fuite). Fix 097.
- ❌ Column-grant (`REVOKE/GRANT SELECT(cols)`) sur une table référencée par le sous-select d'une policy RLS d'une AUTRE table → `permission denied` en cascade (révoquer merchants.user_id a cassé la lecture anon de products). Solution : encapsuler le cross-table dans une fonction `SECURITY DEFINER` (`auth_owns_merchant`). Fix 098. **Toujours re-tester les surfaces publiques en anon après un REVOKE.**
- ❌ Deux overloads d'une RPC (avec/sans param `DEFAULT`) = `PGRST203` ambigu → route morte. Garder UNE signature par nom. Fix 099 (feed/discover/promos étaient cassés en prod).

## Données produit (taille / catégorie / available_sizes)
- ❌ Le parseur de fichier (detectColumns) ne reconnaissait AUCUNE colonne taille/pointure → tailles perdues pour les exports `nom|taille|qté|prix` (cas mode/sneakers). Ajouté SIZE_HEADERS + ParsedInvoiceItem.size ; snapshot préfère la colonne (fiable) à extractSize(nom) (déduit). available_sizes porte `source` (file_column|name_regex|pos). (2026-06-14)
- ❌ groupVariantsByEAN réécrivait `available_sizes` depuis `products.size` (NULL pour les produits-fichier, dont les tailles sont groupées en mémoire par le snapshot) → écrasait les tailles par `[]`. Deux mécanismes de groupage concurrents. Rendu non-destructif : n'écrit available_sizes que si des tailles sont calculées. Trouvé par e2e (available_sizes vide après push). (2026-06-14)
- ❌ categorize appliquait la catégorie IA sans seuil de confiance → fausses catégories. Seuil 70 ; en dessous, pas appliquée mais tentative marquée (sélection sur ai_categorized_at null = anti-reboucle). (2026-06-14)
- ⚠️ Rappel : l'EAN donne l'IDENTITÉ (nom/marque/photo/catégorie brute), JAMAIS la taille ni la quantité (données de la source marchand). KicksDB (sneakers, exploite le SKU) est inerte sans KICKSDB_API_KEY (gratuite).

## Modèle de données stock (cœur "data propre", 2026-06-17)
- ❌ La table stock ne traçait PAS la source ({quantity, updated_at} seulement) → la confidence DÉDUISAIT la force de source du pos_item_id (mensonge possible : un produit POS ajusté à la main restait "temps réel/Disponible"). Fix 104 : colonnes `stock.source` + `source_ts`, chaque writer déclare sa source (webhook/pos_sync/file_push/scan/invoice/cloture/manual), confidence lit `sourceStrengthFromStored(stock.source)`. Fallback legacy resolveSourceStrength conservé.
- ❌ `update_stock_atomic` last-write-wins naïf : un REPLACE pouvait écraser une vérité plus fraîche. Fix 104 : garde anti-régression (mode absolute n'écrase pas si source_ts entrant < source_ts en base ; delta s'applique toujours). ⚠️ LIMITE : le cas "fichier périmé écrase webhook récent" n'est PAS résolu (on n'a pas l'heure de génération du fichier — source_ts=now() à réception). Résolution multi-source complète = **ledger append-only**, différé jusqu'à volume/multi-canal réel.
- ⚠️ Pour changer la signature d'une RPC appelée par PostgREST : DROP + CREATE (pas CREATE OR REPLACE avec params en plus → crée un overload ambigu PGRST203).
- ❌ Colonne `NOT NULL DEFAULT 'manual'` + un writer qui OMET la colonne = dérive silencieuse : le batch stock de `syncMerchantPOS` écrivait sans `source` → un stock CAISSE retombait sur `manual` → confidence l'affichait "Stock probable" au lieu de "Disponible". **Règle : pour une colonne dont le DEFAULT a un sens métier dégradé, grep TOUS les writers (`.from("stock").upsert/insert`) et vérifier que chacun la déclare** — pas seulement celui qu'on regarde. (sync-engine était le seul à l'omettre ; webhooks/resync/file_push/untracked OK.) Fix : helper pur `buildPosStockRows`. (Stockage, 2026-06-19)
- ❌ Un seul `.in("col", [milliers d'UUID])` PostgREST = URL de centaines de Ko → dépasse la limite serveur → échec EN BLOC (ici la réconciliation stock=0 → faux "en stock" persistant). **Batcher (lots de 500) toute écriture `.in()` dont la liste est non bornée.** Helper pur `chunk()`. (Stockage, 2026-06-19)
- ❌ Garde INERTE faute de câblage : la garde anti-régression absolue de `update_stock_atomic` (source_ts entrant < base → no-op) ne servait à RIEN car les 4 routes webhook appelaient `updateStockAtomic(...,"webhook")` sans passer `sourceTs` → défaut `now()` (réception serveur), jamais l'heure réelle. Out-of-order Square/Zettle (absolu) = le périmé écrasait le frais. Fix : router `update.updated_at` (déjà calculé par parseWebhookEvent) en `sourceTs`. **Règle : un param de sécurité optionnel d'une RPC doit être vérifié comme RÉELLEMENT passé par tous les appelants — sinon la garde est cosmétique.** (Collecte ③, 2026-06-19)

- ❌ `const { data } = await supabase.from(...).select(...)` qui **jette le `error`** : un échec DB devient indistinct d'« empty ». BUG seulement quand empty→corruption/no-op masqué en succès (≠ auth/lookup où `null→401` est correct → ~250 sites, NE PAS tous chasser). Trois cas réels corrigés : ingest snapshot (read produits échoué → tout le catalogue recréé en doublon ; read stock échoué → réconciliation no-op → vendus restent « en stock ») → lève / réconcil. annulée+visible ; resync (`ok:true,fetched:0` alors que rien guéri) → `ok:false`/lève. **Discriminateur : destructurer `error` est requis SSI l'appelant ne sait pas distinguer erreur de vide ET que vide cause une perte silencieuse.** (2026-06-20)

- ❌ Un rollup « somme des tailles → stock du principal » appliqué à un produit SOLO SANS taille
  donne total=0 et ÉCRASE la qté autoritaire que le webhook venait de poser → faux « rupture »
  silencieux (vente perdue). `recalculateGroupSizesAdmin` (4 webhooks, après `updateStockAtomic`)
  totalisait `availableSizes.reduce` (membres tailles seulement). Fix : early-return si
  `availableSizes` vide (= solo, pas un groupe à totaliser) → ne pas toucher stock ni
  available_sizes. **Règle : un calcul dérivé qui REMPLACE une valeur autoritaire doit no-op
  quand son entrée est vide, jamais écrire 0.** Bug présent dans les DEUX jumeaux
  (`recalculateGroupSizes` sync-engine + `recalculateGroupSizesAdmin`) — corriger les deux.
  Writes du rollup rendus non silencieux (captureError sans lever : stock déjà committé, lever
  rejouerait le webhook = double-décrément delta). (2026-06-20)

- ❌ **Garde cosmétique côté LECTURE** : la 104 a ajouté `stock.source_ts` (heure RÉELLE de
  l'observation) « pour une confidence honnête » et les webhooks le remplissent avec l'heure de
  l'événement — MAIS les 3 routes d'affichage passaient `stock.updated_at` (heure d'ÉCRITURE DB)
  à `productConfidence`. Un webhook traité en retard (retry/outage) → `updated_at=now` →
  « vu à l'instant / Disponible » pour une vente observée des heures plus tôt = faux positif de
  fraîcheur. **Règle (symétrique au write) : une colonne ajoutée par une migration "pour X honnête"
  doit être vérifiée comme RÉELLEMENT LUE par tous les consommateurs** — sinon la migration est
  cosmétique. Fix : helper unique `stockRowToConfidenceInput` (source unique anti-régression d'un
  4ᵉ caller) + `source_ts` aux SELECT. **Invariant de fraîcheur** : `freshnessTs` PLAFONNE source_ts
  à updated_at — on ne peut pas observer la source APRÈS l'écriture DB ; un `source_ts` postérieur est
  toujours un artefact (DEFAULT now() de l'ALTER sur lignes back-fillées, dérive d'horloge) → prendre
  le plus ANCIEN. (maillon 5, 2026-06-22, revue silent-failure-hunter)

## Silent-failure : rendre un write « non silencieux »
- ❌ **Branches JUMELLES CREATE/UPDATE traitant le même write de façon ASYMÉTRIQUE** : dans
  `ingestStockSnapshot`, la branche UPDATE vérifiait `stockErr` mais la branche CREATE faisait
  `await admin.from("stock").upsert(...)` SANS capturer l'erreur → un produit créé dont l'upsert
  stock échoue restait sans ligne stock = lu « 0 » en aval = perte silencieuse de la qté. Fix :
  symétrie (errors+captureError, statut partial), `stock_replaced` non compté si l'écriture
  échoue (compteur honnête), pas de throw (le produit existe → prochain push complet le matche en
  UPDATE = auto-guérison). **Règle : quand deux branches (create vs update, twins recalc) écrivent
  la MÊME donnée, leur gestion d'erreur doit être identique — grep les deux avant de committer.**
  (Trouvé par silent-failure-hunter au maillon 2, 2026-06-22)
- ✅ **Alerte de couverture de colonnes** (maillon 2) : un défaut MUET (colonne quantité non
  reconnue → qty=1 « présence » partout) devient un SIGNAL en faisant remonter la couverture du
  parse (`parseStockFile` → `coverage`) jusqu'à l'ingest (`column_coverage` + errors + Sentry).
  L'invariant « ne rien perdre silencieusement » vit au TRIAGE/INGEST (là où on connaît l'impact),
  pas au décodage. Ne PAS changer la sémantique dégradée (décision produit) — juste l'arrêter
  d'être muette. (2026-06-22)
- ❌ Transformer un write avalé (`error` jeté) en **throw** AUGMENTE la surface de throw →
  un caller dont le `catch` ne fait que `console.error` rend la nouvelle défaillance
  **Sentry-invisible** en prod (pire qu'avant : on croit l'avoir rendue visible). **Règle :
  après avoir fait lever un symbole, grep TOUS ses callers et vérifier que chaque `catch`
  appelle `captureError`, pas seulement `console.error`.** Cas : `groupVariantsByEAN` rendu
  throw → `invoices/[id]/validate` n'avait que `console.error`. (Trouvé par silent-failure-hunter, 2026-06-21)
- ⚖️ **Throw vs captureError-et-continue** se choisit par MODE D'ÉCHEC, pas par uniformité :
  LÈVE si (intégrité/faux-positif) ET (write absolu+idempotent) ET (avant le bookkeeping
  succès) → re-converge au re-run sans double-comptage (ex. `groupVariantsByEAN`, marquage
  `pending_review`). CAPTURE-et-continue si l'enjeu est moindre (métadonnée périmée, promo
  manquante) ET qu'une ligne fautive ne doit pas **figer** tout le sync du marchand (un throw
  re-planterait au même produit à chaque run) — et alors le **compteur ne compte que les
  succès réels** (`products_updated`/`promos_imported`). (2026-06-21)

- ❌ `resolveWebhookProduct` (4 routes webhook POS) faisait `const { data } = ...` sur la
  lecture produit par `pos_item_id` → un échec DB devenait indistinct de « produit non suivi »
  (les deux → `null` → `if(!product) continue` → 200 OK). Une MAJ stock temps réel perdue, le
  POS ne renvoie jamais = perte silencieuse n°1. Fix : LÈVE sur `error` (≠ 0-candidat qui reste
  null normal) → catch route → captureError + 500 → retry POS. **Mode = récupérabilité** : absolu
  (Square/Zettle, pas d'idempotence) → retry ré-applique = récupéré ; delta (Shopify/Lightspeed,
  `webhook_events` inséré AVANT la boucle = at-most-once) → retry dédupliqué = au moins VISIBLE,
  l'idempotence-first protège du double-décrément. (2026-06-21, revue silent-failure-hunter)
- ⚖️ **Idempotence webhook : le check ET l'insert `webhook_events` doivent destructurer `error`.**
  Un check qui avale l'erreur → `existing=null` → re-traitement → **double-décrément delta**. Fix :
  `captureError` + 500 (retry → dedup). Un insert avalé idem. (Finding 3a/3b, 2026-06-21)

- ❌ **Garde write-side d'affichage non rejouée au READ quand sa dépendance peut changer** : `POST
  /promotions` valide `sale_price < product.price` à la CRÉATION, mais le prix produit peut BAISSER ensuite
  (re-ingest fichier / sync POS) sous une promo encore active → promo périmée `sale_price ≥ prix courant`.
  Les routes de lecture renvoyaient `sale_price` brut → `followed-feed` calcule `(price-sale)/price*100` =
  **% négatif/aberrant**, `product-detail` un `displayPrice` > prix réel = faux rabais (north-star « afficher
  honnêtement »). **Règle (symétrique à maillon 5)** : une garde posée au WRITE doit être rejouée au READ —
  le point où les deux opérandes (prix courant + sale_price) se rencontrent — dès que l'une peut évoluer
  indépendamment après le write. Fix : helper pur unique `honestSalePrice(price, salePrice)` (source unique
  serveur, sémantique = gardes client `sticky-cta-bar`/`explorer-feed`), appliqué aux 6 routes émettrices.
  **Méta-leçon** : un invariant connu mais appliqué de façon INCOHÉRENTE (ici gardé dans 2 fronts sur 4 +
  au write, pas au read) = même risque qu'un invariant absent → centraliser en 1 helper traversé par tous.
  (maillon 6, 2026-06-22, 2 revues silent-failure-hunter)
- ⚠️ **`honestSalePrice` côté `products/[id]` masquait toutes les promos si `price` null/0** (indistinct de
  « aucune promo ») → rendu VISIBLE via `captureError` (PAS `console.warn`, Sentry-invisible) en gardant la
  suppression prudente. Rappel : 0€ promo INATTEIGNABLE (`promotionBody.sale_price = z.number().positive()`)
  → ne pas « corriger » le cas 0 côté front (vérifié avant d'agir). (maillon 6, 2026-06-22)

## Canaux sortie / feeds externes
- ❌ **Push aveugle** : un `2xx` à l'insert d'un produit dans un feed traité en ASYNCHRONE (Google Merchant `productInputs:insert`) ne vaut PAS acceptation — la plateforme peut REJETER ensuite (GTIN/image/politique). Compter « pushed = HTTP ok » affiche « sur Google » un produit en fait rejeté = faux positif n°1. **Règle : tout canal sortant async doit avoir un READ-BACK du statut traité** (Google : `products.v1beta` → `destinationStatuses`/`itemLevelIssues`, cron `google-status`). Classer sur `destinationStatuses` (stable cross-version), pas sur les libellés de severity. (2026-06-20)

- ❌ **Gate de sortie appliqué de façon INCOHÉRENTE entre deux canaux vers le MÊME tiers** : les
  deux feeds Google (Voie A cron Content API + Voie B XML crawlé) filtraient différemment. Voie A :
  `visible AND validated AND archived_at IS NULL AND variant_of IS NULL` ; Voie B : `visible AND
  validated` seulement. Or `archive_product` (RPC 068, granté authenticated) met `archived_at` SANS
  toucher `visible` → un produit archivé reste `visible=true` → la Voie B l'annonçait au crawler
  Google = produit fantôme (le catalogue fantôme qui a tué MVMS/Milo). Les variantes étaient déjà
  exclues par `visible=false` (redondant) mais le gate ne doit pas DÉPENDRE de cette co-occurrence.
  **Règle : les N canaux de sortie vers une même plateforme doivent émettre le MÊME ensemble — gate
  centralisé/identique, vérifié par test de chemin réel (faux client read qui applique `.eq/.is`),
  pas juste la fonction pure de transformation.** (maillon 7, 2026-06-22, même classe que store_code)
- ❌ Sur un cron multi-marchand, le SELECT de la LISTE (`google_merchant_connections`) qui avale son
  `error` est PIRE qu'un select par-marchand avalé : un blip DB → `data=null` → `length===0` →
  `200 "aucun marchand connecté"` = TOUT le feed Google abandonné, 0 Sentry, 0 statut. **Règle : le
  read qui décide « rien à traiter » doit distinguer erreur de vide (throw/500 + captureError) — le
  blast radius d'un select de liste avalé = tous les items.** (Finding 2 silent-failure-hunter, maillon 7)

## Identifiants externes (clé de jointure côté plateforme tierce)
- ❌ **Deux chemins de code dérivant le MÊME identifiant externe de sources différentes** créent
  des entités fantômes en double côté plateforme. Cas : le `store_code` Google LFP était
  `twostep-{id8}` (Voie A Content API, persisté en DB) côté crons, mais le **`slug`** côté feed XML
  (Voie B) → Google voyait DEUX magasins pour un marchand → inventaires jamais réconciliés = faux
  positif. **Règle : un identifiant qui sert de clé de jointure chez un tiers (store_code, GTIN,
  account ref) doit avoir UNE source unique** (helper `resolveStoreCode` : valeur persistée prime,
  défaut déterministe en repli, jamais une 2ᵉ dérivation) — grep tous les sites qui le produisent.
  (`src/lib/google/store-code.ts`, 2026-06-20)

## Gate visibilité produits
- ❌ `groupVariantsByEAN` (sync-engine, post-pass appelé par ingestion + POS) rendait visibles (stock>0) tous les produits dont `review_status !== 'pending_review'` — donc aussi les `'pending'`/`'masked'` du gate cascade (089), court-circuitant le "zéro faux positif". Masqué tant que l'enrichissement tournait INLINE juste après (il re-settait visible) ; révélé par le découplage async V2. Fix : ne rendre visible QUE `review_status === 'validated'` (NULL = legacy/default validated OK). Détecté par l'e2e local (visible=true/score=null avant worker). (2026-06-13)
- ⚠️ Hot-reload Next/turbopack ne prend pas toujours un changement de lib importée par une route API → si un fix ne se reflète pas en e2e, **redémarrer le dev server** (kill port 3000) avant de conclure que le fix est faux. (2026-06-13)

## Schéma DB
- ❌ Migration qui documente de nouvelles valeurs d'enum/CHECK sans ALTÉRER la contrainte (081 vs 089 : `review_status` 'pending'/'masked' refusés en prod pendant des semaines, toute création produit du pipeline cassée). Détecté uniquement par le e2e d'ingestion. Règle : toute nouvelle valeur d'état → grep le CHECK existant dans les migrations AVANT. Fix : 096. (2026-06-13)

## Git / workflow
- ⚠️ Un run autonome interrompu (ledger `exit=1`) peut laisser du WIP **non committé** dans le working tree. **Au démarrage : lire `git status`** — si un fichier est modifié et que le diff est sain/aligné, le **FINIR** (tests + revue + commit) au lieu de le jeter ou d'empiler dessus à l'aveugle. Cas vécu : `google/inventory.ts` (helpers purs + fix silent-failure) laissé par le run `131701` exit=1 → fini run 4. (2026-06-20)
- ❌ Ne jamais commiter directement sur main → toujours créer une branche feat/<nom>
- ❌ Email git : ne pas utiliser thomasbauland1304@gmail.com → utiliser bauland@twostep.fr
- ❌ Push sans lancer `npm run test:run` → CI rouge = révélé au mail GitHub. Hook pre-push installé le 2026-04-22 dans `.githooks/pre-push` (tests + tsc auto). Activation : `npm run prepare` (auto après clone via npm). Bypass urgence : `SKIP_PRE_PUSH=1 git push`

## Parsing / data-integrity (Collecte ⑤ + Triage, 2026-06-19)
- ❌ `Number(x) || défaut` détruit un **0 légitime** (prix attesté gratuit, qté en rupture) ET, pour la qté, `Number(null)===0` / `Number("")===0` (pas NaN !) → un champ ABSENT devient 0 au lieu du défaut "présence". Règle : garder la valeur BRUTE (`x != null && x !== ""`) avant de tester `Number.isFinite`, ne retomber sur le défaut que si vraiment absent/illisible. (parseJsonResponse, spreadsheet, einvoice-cii, parse-price callers.)
- ❌ Texte extrait d'un XML par **regex** sans décoder les entités → toute marque avec `&` (D&G, H&M, obligatoirement `&amp;` en XML valide) stockée polluée. Décoder numériques + nommées, `&amp;` EN DERNIER (anti double-décode). (parseCiiXml)
- ❌ Matching SKU en **exact-case** alors que l'EAN est canonique et le nom normalisé → `REF-001` (CSV) vs `ref-001` (POS) = doublon. `.toLowerCase()` des 2 côtés (set + get). (match-product.ts ; snapshot.ts le faisait déjà → asymétrie).
- ❌ Helper de parse LLM qui `return []` sur réponse malformée = échec MASQUÉ : le caller compte 0 échec, et si l'état "tenté" n'est pas marqué (ex. `ai_categorized_at` reste null) il RE-tente à chaque run en brûlant des tokens, sans trace (coût caché). Pire : un JSON valide mais **non-tableau** (`{"error":...}`) passe `JSON.parse` puis crashe le `for...of` du caller HORS try/catch (TypeError non catchée → route down). Règle : un parseur LLM **LÈVE** (non-JSON ET non-tableau, garde `Array.isArray`) → routé vers le catch existant du caller qui compte/logue. (parseCategorizationResponse, 2026-06-19)
- ❌ **`buffer.toString("utf-8")` en dur sur un CSV marchand** : les POS legacy FR (Clictill,
  Fastmag, Excel-FR) exportent en **Windows-1252/Latin-1**. L'octet accentué (é=0xE9) devient `�`
  → l'en-tête « Quantité » ne matche plus `detectColumns` → **colonne qté perdue en silence**
  (qty→1 « présence »). Fix : détecter l'encodage (`TextDecoder utf-8 {fatal:true}` → si throw,
  repli `windows-1252` ; BOM UTF-16 d'abord). Byte-identique pour tout UTF-8 valide. Le vrai point
  de perte résiduel = colonne qté/identité **non détectée sans alerte** → alerte de couverture de
  colonnes au triage/ingest, pas au décodage. (`parse-stock.ts decodeCsvBuffer`, 2026-06-22)
- ❌ Un test d'ingestion en **dryRun seul** prouve les LECTURES mais JAMAIS create/update ni
  l'invariant « 0 doublon » (aucune écriture exercée) → fausse confiance sur le hot path. Pour
  prouver le chemin d'écriture : faux client Supabase **stateful** qui applique réellement
  `insert/update/upsert` (upsert onConflict, update-by-id) → on inspecte la table résultante (count
  + champs). C'est le seul moyen de prouver l'idempotence (re-push → 0 créé) et le dédoublonnage
  cross-canal/intra-push. Vaut pour tous les maillons à écriture (3→8). (`ingest-maillon3-match`, 2026-06-22)
- ❌ **Décrémentation à 0 qui ne nettoie PAS les champs dérivés d'affichage** : la réconciliation
  snapshot mettait `stock.quantity=0` pour un produit absent du push (vendu) MAIS laissait
  `products.available_sizes` avec des qtés positives périmées. La liste discover gate sur stock>0
  (donc disparaît), mais la **fiche produit** + la **facette tailles globale** lisent
  `available_sizes.quantity` indépendamment du total stock → pointures fantômes « disponibles » =
  faux positif d'affichage. **Règle : quand un write met une valeur autoritaire à 0/épuisé, vider
  AUSSI les champs dérivés que des READ consomment séparément** (ici `available_sizes:[]` batché dans
  la réconciliation). Restauré au prochain push qui contient le produit. (maillon 4, 2026-06-22)
- ✅ **Avant de "corriger" un champ côté WRITE, vérifier comment le READ le consomme.** `available_sizes` inclut qty=0 mais TOUS les consommateurs filtrent `qty>0` à la lecture (product-detail, route facette) → ce n'était PAS un bug. L'agent Explore signale des "bugs" qu'il faut vérifier dans le code réel (plusieurs étaient faux : orphelin DB inexistant car insert APRÈS upload ; prix 0 déjà géré dans shared.ts). Zéro complaisance = lire, pas croire l'audit.

## Git / hooks
- ❌ `git add -A` après une série de commits a happé les fichiers régénérés par le **hook gitnexus** (`analyze` réécrit ses blocs managés `<!-- gitnexus:start -->` dans CLAUDE.md/AGENTS.md + les SKILL.md) dans un commit `docs(...)` sans relecture → contenu auto-généré bénin mais bundle trompeur. Règle : quand un hook PostToolUse peut régénérer des fichiers, **stager les chemins explicites** (`git add src/... tests/... docs/...`) ou vérifier `git status` avant `git add -A`. (2026-06-19)

## Fix bug cross-module
- ❌ Corriger un code sans mettre à jour les tests qui référencent l'ancienne valeur → grep la constante/valeur dans `tests/` avant commit. Commit `1e45f3d fix(google): align LFP feed format` a corrigé `feed.ts` mais pas `feed.test.ts` → 2 tests failaient depuis (2026-04-22)

## Claude Code / environnement Windows
- ❌ Sur Windows, winget et npm installent deux versions de Claude Code → mettre à jour les DEUX à chaque fois
- ❌ Bun 1.3.11 crashe (Illegal instruction) en subprocess Windows → `bun upgrade` vers ≥ 1.3.13 (2026-04-22)
- ❌ `/plugin marketplace add X` + `/plugin install Y` sur la MÊME ligne : Claude Code concatène → lancer chaque slash command séparément (2026-04-22)
- ❌ Un script `.ps1` exécuté par le Planificateur (PowerShell 5.1) DOIT être en **ASCII pur** (ou UTF-8 **avec BOM**) : un `.ps1` UTF-8-sans-BOM contenant emoji/accents est lu en ANSI → **erreur de parsing → exit 1, le script ne démarre même pas** (aucun log). Symptôme vécu : tâche `TwoStepAutonomy` LastResult=0x1 sans log, 0 notif (2026-06-19). `scripts/autonomy-run.ps1` gardé ASCII pur ; vérifier via `[Parser]::ParseFile` + compter les octets >127.

## Outillage installé
- **graphify** : graphe de connaissances codebase, output dans `graphify-out/` (ignoré par git). Mettre à jour via `/graphify` ou `graphify update .`
- **claude-mem** (v12.3.8) : mémoire auto de sessions Claude Code. Worker sur port 37777, DB `~/.claude-mem/claude-mem.db`. Outils MCP `mcp__plugin_claude-mem_mcp-search__*`
- **gitnexus** : index de code sémantique (1937 symbols). Hook PostToolUse ré-indexe après commit/merge. MCP tools `mcp__gitnexus__*`
- **parallel** (plugin `parallel@parallel-agent-skills`, v=?) : recherche web via API Parallel.ai. 6 skills : setup/status/result/web-search/data-enrichment/web-extract/deep-research. `/parallel:setup` pour init CLI + API key (pas encore fait)
- **deep-research** (skill) : cloné dans `~/.claude/skills/deep-research/`, utilise WebSearch/WebFetch natifs en fallback (search-cli non installé sur Windows, SERPER + FIRECRAWL disponibles côté Two-Step mais pas encore piped)

## Règle d'arbitrage — outils de recherche
- Question sur lib/API → **Context7** (`mcp__context7__*`)
- Contexte code projet → **gitnexus** (`gitnexus_query/context/impact`)
- Contexte business/Nexus Obsidian → **nexus-twostep-brain** MCP
- Recherche web standard → **Parallel** (plugin)
- Recherche approfondie (comparatif, état de l'art, décision critique) → **deep-research** skill
- `WebSearch` natif → fallback uniquement si rien d'autre n'est dispo

## Builder-bias / décisions
- ❌ Recommander un outil payant "par défaut" (ex : Pennylane PDP 20 €/mo Phase 0) sans valider l'urgence RÉELLE vs alternative gratuite (PPF État, gratuit, suffit à 0-10 marchands). À 0 marchand payant aujourd'hui, le coût caché de cette reco aurait été 120-160 € sur 6-8 mois inutiles. **Question à se poser systématiquement avant d'ajouter un outil au plan** : "Est-ce que la gratuité officielle (PPF, free tier, etc.) couvre les besoins jusqu'à la prochaine inflexion ?" Pattern documenté 2026-04-25 par Thomas qui a challengé. (2026-04-25)
- ❌ Pousser pour avocat (5 000-7 000 € HT) + RC Pro (1 500 €/an) **dès Phase 0** à 0 marchand payant. Sur-investissement avant validation marché. Règle Thomas : **« les démarches juridiques se font quand le SaaS fonctionne »** — drafts emails OK comme ressources, envoi différé jusqu'à 1+ marchand payant + 30 jours sans incident. Vrai trigger légal obligatoire = bascule micro→SASU (Phase 5). (2026-04-25)
- ❌ Présumer une équipe (ex : "Thomas + frère") basée sur d'anciennes fiches mémoire sans vérifier l'état actuel. **Violation R4 du CLAUDE.md global**. Toujours re-poser la question avant d'écrire "Thomas + X" dans un doc de continuité. À la place : "Thomas + tiers de confiance (à désigner)". (2026-04-25)

## Architecture / dette tech
- ❌ Brainstorm archi qui ignore les externes nouveaux : ACP OpenAI (lancé 2026-02), AI Act art.50 (2 août 2026), CRA EU (11 sept 2026), Google product ID split (mars 2026), Inngest orchestrator pour pipelines >5 étapes. **Checklist obligatoire début cycle archi** : "qu'est-ce qui a changé dans l'écosystème depuis 30j ?" Brainstorm 04-24 a raté tout ça → V2 consolidée 2026-04-25 = `docs/ARCHITECTURE-TWOSTEP.md` (2026-04-25)
- ❌ Présenter `ean_lookups` cache cross-marchand comme "moat data juridique" — faux : non protégeable (art. L341-1 CPI), réplicable concurrent en 3-6 mois via Open Food Facts / Open Beauty Facts / UPCitemdb publics. **Vrai moat** = densité géo + relation marchand + statut LFP Trusted (admin) + UX dirty→clean. Requalifier partout en "accélérateur opérationnel" (2026-04-25)
- ❌ Plan SaaS solo qui suppose 50 marchands an 1 sans embauche : NearSt = 1 emp/100 marchands. Bandwidth Thomas réelle = 24-32 marchands max mois 4-12 (5h/marchand/an support consomme bandwidth démarchage). **Gate Phase 5** : embauche 0.5 ETP OU contrat formel apporteurs à 15 marchands (2026-04-25)

## Boucles de recherche autonome (multi-cycles)
- ❌ Stopper à 3 cycles sur 5 annoncés "parce que rendement décroissant ressenti" → le cycle 5 a produit les 2 meilleurs insights (UCP + Fédé). Quand un quota numéraire est annoncé (au user OU à soi-même), tenir le quota — l'instinct de rendement décroissant n'est pas fiable, les angles changent (2026-04-23 boucle nuit, voir META-REPORT)
- ❌ Annoncer "quotas tenus" quand on est à 10-20% du volume promis → marquer explicitement "[ESTIMATION]" sur les chiffres non-sourcés et écrire un META-REPORT honnête en fin de boucle (2026-04-23)
- ❌ Faire une boucle de recherche sans **clôture brain Nexus** → les insights restent dans `research/loop-XXX/` et s'évaporent. Règle : tout insight à impact MAJEUR doit être poussé en fiche brain dans la même session que la boucle, sinon il n'existe pas dans 3 mois (2026-04-23)
- ❌ Créer une nouvelle fiche brain alors qu'une fiche existe déjà → toujours grep `04-Partenariats/`, `09-Veille/` etc. avant de créer. Si contradiction avec fiche existante, **expliciter la contradiction dans la fiche** (Update YYYY-MM-DD), ne jamais écraser silencieusement (2026-04-23 cas Fédé Toulouse)
