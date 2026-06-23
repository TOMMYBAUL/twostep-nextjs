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

## OAuth — scope vs promesse read-only (D6, 2026-06-23)
- ❌ **Un scope OAuth qui demande PLUS que ce que le code utilise = contradiction SILENCIEUSE d'une
  promesse de sûreté au CONSENTEMENT.** Square demandait `INVENTORY_WRITE`, Shopify `write_inventory`,
  mais AUCUN chemin n'écrit de quantité d'inventaire vers le POS (getStock = lecture ; les writes stock
  vont vers Supabase). Le marchand voyait « peut modifier mon inventaire » à l'autorisation → contredit
  « on ne casse pas ta gestion de stock » + viole le moindre-privilège. Fix : retirer le scope mort
  (narrowing = sûr, tokens existants gardent leur grant, on demande un sous-ensemble — pas de changement
  app Square/Shopify requis). **Règle : grep les endpoints d'écriture de chaque scope demandé ; tout scope
  d'écriture sans appelant est mort → le retirer.** Lock par test : `getAuthUrl` ne doit jamais contenir un
  token write-inventory (`tests/pos-readonly-stock-contract.test.ts`). (même classe « garde/promesse
  appliquée de façon incohérente » que maillon 5/6/D7)
- ⚠️ **Vérifier la prémisse d'un item AVANT de la coder** : D6 disait « aucun adaptateur n'écrit vers la
  caisse » — FAUX (pushCatalog + updatePosProduct écrivent du CATALOGUE). La vraie promesse = ne pas écrire
  les QUANTITÉS de stock. Reformuler l'invariant sur ce qui est vrai+vérifiable, ne pas tester un slogan faux.

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

## Webhook POS temps réel — fraîcheur source_ts + recalc (route handlers)
- ❌ **Un adapter `parseWebhookEvent` qui hardcode `updated_at: new Date().toISOString()` jette la vraie
  heure de l'événement → `source_ts` faux → faux positif de fraîcheur** (classe « garde cosmétique » maillon 5).
  Shopify le faisait alors que l'objet order porte toujours `updated_at`/`created_at`/`processed_at` ; Lightspeed
  (`line.timeStamp`) et Square (`calculated_at`) extrayaient déjà le vrai timestamp. Un webhook livré en retard
  (retry/outage) affichait « vu à l'instant / Disponible » pour une vente passée. Fix : `event.updated_at ||
  event.created_at || event.processed_at || now()` (`||` pas `??` : "" = timestamp inutilisable → fallback).
  **Règle : grep les N adapters jumeaux d'un même contrat (fraîcheur) — celui qui jette le timestamp est le trou.**
- ❌ **`await recalculateGroupSizesAdmin()` non gardé dans un route handler webhook = un throw réseau (≠ erreurs
  Supabase qu'il capture en interne) remonte au catch route → 500 APRÈS décrément stock committé → retry POS →
  idempotence skip (`webhook_id` déjà vu) → recalc JAMAIS rejoué** (available_sizes périmé jusqu'au resync 6h).
  Le stock autoritaire est déjà committé ; recalc = métadonnée d'affichage dérivée → **captureError-et-continue**
  (comme `feedErr`/`notify`/`google` le sont DÉJÀ dans la même route), PAS un throw (re-décrément delta). Fix sur
  les 2 jumeaux (shopify+lightspeed). **Règle : dans un webhook delta, tout effet APRÈS le write stock committé
  doit être non-fatal (captureError) — un 500 post-write + idempotence-first = perte de l'effet secondaire.**
- ✅ **Couvrir un route handler webhook au niveau ROUTE** (pas juste l'adapter) : `tests/webhook-routes-stock.test.ts`
  drive le vrai `POST` avec adapters/admin/updateStockAtomic mockés → prouve signature→401 (0 effet de bord),
  idempotence doublon→skip (0 décrément) / erreur→500, delta+`source="webhook"`+`source_ts`=heure événement câblés,
  resolve null→skip vs throw→500. Paramétré sur les 2 jumeaux = parité prouvée d'un coup. (2026-06-23, revue SF-hunter)
- ✅ **Les jumeaux ABSOLUS (Square/Zettle) ont une sémantique distincte des jumeaux DELTA (Shopify/Lightspeed) — les
  tester à part.** Mode `"absolute"` (qté = état, pas un décrément) + **PAS d'idempotence `webhook_events`** (le ré-envoi
  ré-applique l'absolu, idempotent via la garde anti-régression 104 sur `source_ts`) → le test doit prouver que la table
  `webhook_events` n'est JAMAIS touchée (mettre un sentinelle `webhookEventsTouched`), 403 (≠ 401 delta) sur signature,
  `updateStockAtomic(...,"absolute",...,source_ts=heure événement)`. Square/Zettle extraient DÉJÀ le vrai timestamp
  (`calculated_at`/`event.timestamp`) → pas le bug fraîcheur de Shopify. `tests/webhook-routes-stock-absolute.test.ts`.
- ⚖️ **Le `recalculateGroupSizesAdmin` non gardé est MED (pas HIGH) en mode absolu** : le retry POS ré-applique l'absolu
  (idempotent) ET rejoue recalc → auto-guérison, contrairement au delta (idempotence-skip → recalc jamais rejoué = HIGH).
  Le fix (captureError-et-continue) reste justifié pour les 2 : (a) un échec d'AFFICHAGE ne doit pas devenir un 500 du
  CANAL STOCK, (b) évite un retry POS inutile, (c) **parité des 4 routes** (un mainteneur attend un traitement identique).
  Régler la sévérité par le MODE D'ÉCHEC réel, pas par uniformité — mais corriger pour la cohérence quand même. (2026-06-23)
- ❌ **feed_event émis sur un write rejeté par la garde anti-régression** : `update_stock_atomic` renvoie `v_previous`
  indistinctement en write-committé ET en stale-rejeté (104) → la route zettle (feed_event INCONDITIONNEL) ré-émet un
  event sur un no-op (retry absolu → `previousQty==quantity` → type « sale » faux) = pollution feed. Square évite ça en
  gateant `previousQty===0 && quantity>0` (restock-from-zero only). Fix propre = signal de skip dans la RPC (migration) ou
  décision produit (émet-on les ventes au feed ?). **Règle : un effet de bord dérivé d'un write conditionnel (garde 104)
  doit savoir si le write a VRAIMENT eu lieu — sinon il se déclenche sur le no-op.** → Rang 2 gated. (2026-06-23, SF-hunter)

## Silent-failure : rendre un write « non silencieux »
- ❌ **read-modify-write dont la LECTURE avale `error` → écrasement silencieux par une valeur partielle.**
  `invoices/[id]/validate` (facture = marchandise reçue) : `const { data: currentStock } = …` puis
  `upsert(quantity = (currentStock?.quantity ?? 0) + facture)` → un blip DB sur la lecture rendait
  `data=null` indistinct de « pas de stock » → l'upsert ÉCRASAIT la qté réelle par la seule qté facture
  (perte de stock). MÊME motif sur la lecture `available_sizes` (tailles réelles écrasées par la liste
  partielle de la facture). **Règle : dans un read-modify-write, une lecture qui échoue ≠ valeur vide →
  distinguer (`error`) et, sur erreur, NE PAS écrire (préserver l'existant) + `captureError` ; le re-run
  re-fusionne.** Idem : un `insertErr` destructuré mais seulement `console.log` (dev) = produit droppé en
  silence (facture quand même « validée ») → branche `else` qui remonte ; compteur (`stock_updated`) compté
  **par succès réel**, jamais sur une écriture en échec. (route validate, 2026-06-22, revue silent-failure-hunter)
- ⚠️ **Capture-and-continue n'est sûr que si le re-run re-converge SANS double-comptage** — vrai ici car
  l'écriture en échec n'a PAS eu lieu (le re-validate la re-tente une 1re fois). MAIS un re-validate d'une
  facture déjà entièrement « validated » double-compte le stock (read-modify-write add non idempotent) :
  silent-failure ≠ idempotence ; vérifier les DEUX, ne pas conclure « ré-exécutable » sans tracer le cas succès.

## Silent-failure : rendre un write « non silencieux » (suite)
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

## Vérification / fail-open (trust gate)
- ❌ **Une fonction de vérification qui fail-open en `valid:true` sans signal distinctif = faux
  positif silencieux.** `verifySIRET` retournait `valid:true` quand l'INSEE n'était pas joignable
  (token absent = cas PROD / 401 / 5xx / réseau) — indistinct d'un « vérifié ». Règle : un résultat de
  vérif doit DIRE qu'il n'a pas vérifié (champ `pending`/`unverified`), pas se faire passer pour validé ;
  laisser passer (fail-open) est OK SI on le dit ET qu'on marque l'aval (ici `status:"pending"`).
  Discriminer l'erreur **attendue** (config : token absent → pas de Sentry) de l'**inattendue**
  (401/5xx/throw → captureError). (`siret.ts`, 2026-06-22)
- ❌ **Contrat write/read incohérent route↔form, double faute** : la route émettait des champs PLATS
  (`{name,address}`) mais les forms lisaient `data.company.*` (toujours `undefined` → pré-remplissage MORT) ;
  et la route renvoyait `valid:false` au statut **400** alors que les forms testaient `res.status===404`
  (branche morte → introuvable/fermé passait en silence à l'étape suivante). Une machinerie entière
  (`pending` → `merchant_siret_pending` → `status active|pending`) câblée de bout en bout mais le signal
  ne circulait JAMAIS → 100 % des marchands prod créés `active` sans vérif. **Règle : un contrat
  route↔client se prouve par un test qui drive la VRAIE route ET vérifie la forme exacte que le client
  consomme** (clé `company`, statut HTTP). Même classe que maillon 5/6 (garde write non rejouée au read).
  ⚠️ Sécurité : `status` dérivé de `user_metadata` client-writable = trust-gate à durcir (escaladé). (2026-06-22)

- ❌ **Garde anti-faux-positif présente sur UN chemin, absente sur le chemin SYMÉTRIQUE** (même classe que
  maillon 5/6 « garde write non rejouée au read »). La cascade d'identité gardait le chemin **reverse**
  (nom→EAN via `verifyEanMatchWithAI`) mais PAS le chemin **forward** (EAN saisi→nom résolu par OBF) : un EAN
  mal saisi/réutilisé résolvait une identité réelle mais FAUSSE et l'auto-publiait (tier2 0.97 ≥ 0.95) sans
  croiser avec le nom marchand = « confiance à une seule source ». Fix D7 : garde de concordance pure
  `evalIdentityConcordance` (`scoreNameMatch ≥ 0.25`, downgrade-only validated→pending, score brut préservé),
  appliquée à TOUS les points de sortie de `runCascade` — **y compris l'early-return CIP** (trouvé par
  silent-failure-hunter : médicament = le faux positif le plus dangereux). **Règle : quand un gate de sûreté
  existe sur un chemin, grep TOUS les chemins jumeaux/points de sortie qui produisent la même décision et
  vérifier qu'ils l'appliquent — un early-return est un trou classique.** (cascade-engine, D7, 2026-06-23)
- ⚠️ Revue adversariale : un finding « faux downgrade » doit être vérifié PAR CALCUL avant d'agir.
  SF-hunter a signalé une asymétrie de brand dans `scoreNameMatch` donnant 0.22 → faux. Calcul réel = 0.89
  (brand préfixé sur l'original le RALLONGE vers le candidat ; `overlapScore` pèse 60 % et est symétrique).
  ~70 % des findings non vérifiés sont faux, y compris ceux d'un agent spécialiste. (2026-06-23)

- ❌ **Une fonction « verify » qui `return true` sur ERREUR (clé absente / HTTP !ok / catch) publie sans
  preuve.** `verifyPhotoWithAI` (`serper.ts`, gate d'image sourcée Serper) fail-openait en `true` sur ses 3
  échecs → image potentiellement FAUSSE publiée. Pire : `ANTHROPIC_API_KEY` absente en prod → 100 % des images
  non vérifiées. Règle (classe SIRET) : vérif ON + erreur ≠ preuve de match → retourner `false` (écarter le
  candidat) + `captureError` ; vérif OFF par config (clé absente) → on peut laisser passer MAIS le DIRE
  (captureError 1×/process, flag module anti-flood) — jamais silencieux. Distinguer « pas pu vérifier » de
  « vérifié OK ». `verifyImageUrl` HEAD laissé en skip silencieux (URL morte = bénin/fréquent, captureError y
  flood). (`serper.ts`, D5, 2026-06-23, revue SF-hunter SOUND)

## Boucle d'écriture par item + RPC atomique (livraison reçue)
- ❌ **Un `await admin.rpc(...)` dans une boucle SANS destructurer `error`, suivi de `counter++`
  inconditionnel** = perte silencieuse derrière voyant vert. `POST /api/stock/receive` (livraison
  confirmée → `receive_stock_incoming` incrémente le stock + marque la ligne `received` + feed_event)
  comptait `received++` même si la RPC échouait → marchand voit « N reçus / stock mis à jour » alors que
  le stock n'a PAS bougé. **Fix (classe `resync` `if(!error) updated++`)** : destructurer `error` ; sur erreur
  → captureError + `failed++` + `continue` ; `received` ne compte QUE les succès. **Contrat de réponse honnête** :
  échec TOTAL (`received===0 && failed>0`) → 500 (l'UI montre une erreur, pas un faux succès) ; partiel → 200 avec
  `{received, failed}` honnête. **Capture-and-continue SÛR ici car la RPC est atomique par item** (transaction plpgsql
  unique) → un échec ne demi-applique rien, la ligne reste `incoming` = re-cliquable, idempotent, 0 double-comptage.
- ⚠️ Même run : 2 reads d'aiguillage du même fichier transformaient un blip DB en 404 (incoming `const {data}`,
  merchant `.single()`) → distinguer erreur de vide (throw/500 + captureError ; PGRST116 = 0 ligne reste 404 légitime).
  Règle déjà connue (maillon 8 / `resolveWebhookProduct`), re-trouvée par grep des reads du fichier qu'on durcit.
  (`stock/receive`, 2026-06-23, revue SF-hunter SOUND)

## Annulation facture → réversion de stock (cancel route)
- ❌ **RPC référencée mais INEXISTANTE → le fallback buggé tourne à CHAQUE appel.**
  `invoices/[id]/cancel` appelait `admin.rpc("increment_stock_quantity", …)` (aucune migration ne
  la définit) → `res.error` toujours vrai → le fallback read-modify-write tournait toujours. Et ce
  fallback **forçait le stock à 0 sur un blip de lecture** : `const { data: current } = …` (error avalé)
  → `current=null` → `max(0, (null ?? 0) - delta) = 0` → une vraie quantité écrasée à 0 = faux « rupture »
  silencieux. **Règle : grep que toute RPC `admin.rpc("nom")` existe dans `supabase/migrations/` — sinon
  le « fallback » EST le chemin réel (et doit être correct), pas un secours.** Fix : `reverseStock` qui
  distingue erreur de vide (read err → captureError + skip, JAMAIS écrire 0), update err → captureError ;
  réversion partielle → 500 honnête sans remettre la facture en `parsed` (reste annulable). Mêmes 2
  écritures avalées sur le chemin correctif. + items_read avalé (blip → `stockDeltas={}` → faux « annulée »
  sans réversion = stock fantôme). `tests/invoice-cancel-writes.test.ts` (+10, TDD 5 rouges→vert).
  ⚠️ Résidu pré-existant (NON introduit) hors scope : réversion delta non idempotente au retry (re-décrément
  borné à 0) + correctif ré-exécutable (original non marqué « corrigé ») = durcissement Rang 2 (idempotence).
  (cancel route, 2026-06-23, revue SF-hunter : 0 silent-failure introduit, Finding 1 items_read corrigé ce run)

## Canaux entrée / webhooks tiers (Resend, POS)
- ❌ **Un handler de webhook tiers qui renvoie 200 sur une erreur DB/API confond « perdu » avec
  « rien à faire »** → l'émetteur (Resend, POS) ne réessaie JAMAIS = perte silencieuse n°1. Cas
  `POST /api/inbound-email` (canal email-in stock) : (a) résolution `merchants.inbound_email_slug`
  avalait `error` (`const { data: merchant } = ...`) → blip DB → merchant=null → `200 "no matching
  merchant"` → email stock du marchand perdu ; (b) `resend.emails.get` `{data:null,error}` →
  `attachments=[]` → faux « no attachment »+200 → CSV pourtant présent perdu (et l'alerte Sentry
  MISDIAGNOSTIQUE « no attachment » au lieu de « fetch raté »). **Règle (même classe que
  `resolveWebhookProduct`) : dans un handler webhook, erreur DB/API ≠ « rien à traiter » → throw/500
  + captureError (l'émetteur réessaie) ; ne réserver le 200 bénin qu'au VRAI no-match (spam/slug
  inconnu) pour ne pas faire boucler les retries.** (maillon 8, 2026-06-22, revue silent-failure-hunter)

## Facture → catalogue POS (activateInvoice)
- ❌ **Une lecture qui distingue « POS vs non-POS » et avale son `error` fait passer un marchand POS pour non-POS →
  catalogue jamais poussé en silence.** `activateInvoice` lisait `pos_connections` via `.maybeSingle()` sans
  destructurer `error` → blip DB → `conn=null` → branche non-POS → facture marquée `imported` SANS `pushCatalog` →
  produits sans `pos_item_id` → plus aucun stock temps réel. **Règle (classe maillon 8 / `resolveWebhookProduct`) :
  un read dont le résultat AIGUILLE entre deux branches (a un effet de bord différent par branche) doit distinguer
  erreur de vide — `.maybeSingle()` renvoie `error:null` à 0 ligne, donc `if (err) throw+captureError` ; l'absence
  vraie = `{data:null,error:null}` reste la branche par défaut.** Idem `invoice_items` (err déguisé en « run validate
  first »). Mapping `pos_item_id` post-push réussi : captureError SANS throw (re-run → doublon POS). (activate.ts, 2026-06-23)
- ⚠️ **Un `if (err || !data) throw new Error("not found")` perd l'erreur Supabase d'origine** : le throw synthétique
  remonte au catch route mais code/hint/message Supabase sont effacés côté Sentry. Séparer : `if (err){captureError(err);
  throw}` puis `if (!data){throw "not found"}`. (revue SF-hunter, activate.ts 3a/3b, 2026-06-23)

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
- ❌ **Garde d'honnêteté affichée mais ABSENTE des canaux sortants** : `honestSalePrice` gardait le
  `sale_price` sur le hot path consumer (maillon 6) mais les 2 feeds Google (Voie A `feed.ts` + Voie B
  `lfp-xml.ts`) **n'émettaient AUCUN sale_price** → les promos marchand ne remontaient pas sur Google
  (manque à gagner) ET, dès qu'on les ajoute naïvement, risque de pousser un faux rabais. Fix D1 : helper
  pur unique `activeFeedSalePrice` (réutilise `honestSalePrice` + fenêtre active `starts_at`/`ends_at`,
  meilleur rabais) → un prix promo n'atteint Google que s'il est actif ET un vrai rabais. **Règle : une
  garde d'honnêteté d'affichage doit couvrir TOUS les exutoires d'un prix — read consumer ET feeds
  sortants** (3ᵉ surface après write `/promotions` + read). Pas de `sale_price_effective_date` : le feed
  = état courant (re-push 3h/re-crawl 15 min), comme availability. (D1, 2026-06-23, revue SF-hunter SOUND)
- ❌ **Éligibilité de feed divergente entre 2 canaux** (même classe que store_code maillon 7) : Voie A
  `filterEligibleProducts` acceptait `price=0` + EAN tronqué que Voie B `filterFeedEligible` rejetait
  (`price>0`, `ean.length>=8`) → ensembles émis différents vers le MÊME tiers. Fix : prédicat partagé
  `isFeedEligible` (`feed-eligibility.ts`) délégué par les 2 ; `nowMs` capturé une fois par feed. (D1)
- ❌ **Un KPI qui PRÉDIT un gate via un proxy plus laxe que le gate = faux positif affiché.** Le KPI
  « % publiable Google » (`/api/google/stats`, montré au pilote) comptait `eligible_google = ean && price
  !== null` → comptait « éligibles » des produits SANS image / prix 0 / GTIN tronqué que le feed
  (`isFeedEligible`) rejette en silence ; + population `visible=true` SEULEMENT vs gate feed
  (`+validated +archived_at IS NULL +variant_of IS NULL`) → un archivé resté visible (068) compté publiable.
  **Règle : un indicateur qui prédit ce qu'un gate laisse passer doit RÉUTILISER le prédicat du gate (pas
  un proxy « à peu près »), et sa population doit être celle du gate** — sinon il ment dans le sens flatteur.
  Fix D3 : 3 prédicats partagés (`hasPublishableGtin/Price/hasImage`) que `isFeedEligible` ET
  `summarizePublishability` composent (source unique anti-dérive, classe store_code/honestSalePrice) +
  SELECT aligné. Exposé aussi `blocked_only_by_image` (EAN+prix OK, image seule manquante) = cause
  actionnable n°1. Et la lecture produits qui avalait `error` → KPI all-zeros silencieux sur blip DB →
  500+captureError. (D3, 2026-06-23, revue SF-hunter SOUND)
- ❌ **Un prédicat « présence » testé `!== null` accepte une chaîne VIDE** : `hasImage` (gate feed Google)
  faisait `photo_url !== null` → `""` (back-fill DB en "" au lieu de NULL) comptait comme une image → produit
  éligible émettant un `<g:image_link>` VIDE = rejet Google silencieux. **Règle : un prédicat d'éligibilité dont
  la valeur alimente un système externe qui rejette le vide doit tester `!== null && !== ""`** (pas juste null).
  Bonus : le compter « sans image » est honnête pour le KPI (`summarizePublishability` partage `hasImage`). (D2, 2026-06-23)
- ✅ **Relâcher un gate de sortie derrière un flag SANS casser la parité multi-canal** : D2 (tier GTIN-only)
  autorise les produits sans image dans le feed Google quand `GOOGLE_GTIN_ONLY_TIER=1`. Pour que les 2 canaux
  (Voie A Content API + Voie B XML) émettent TOUJOURS le MÊME ensemble (anti-catalogue-fantôme), les deux lisent
  le **MÊME** `gtinOnlyTierEnabled()` (default-param évalué au call-time = lecture fraîche) ; aucun ne hardcode son
  propre flag. Prouvé par un test de parité explicite dans les 2 états (OFF→{a}, ON→{a,b}). **Champ optionnel
  (undefined) > null pour une sortie JSON** : `imageLink?:string` omis → `JSON.stringify` retire la clé → Google
  matche par GTIN ; un `imageLink:null` explicite serait rejeté. (D2, 2026-06-23, revue SF-hunter SOUND)
- ❌ **Un KPI qui prédit un gate doit réutiliser le prédicat ET ses MODES SOUS FLAG.** `summarizePublishability`
  (KPI « % publiable » + base de la readiness LFP `lfp_feed_ready`) hardcodait `allowMissingImage:false`, mais les
  2 feeds (`feed.ts`/`lfp-xml.ts`) passent `gtinOnlyTierEnabled()` à `isFeedEligible`. Flag `GOOGLE_GTIN_ONLY_TIER=1`
  (activé au 1er pilote, D2) → le feed PUBLIE les produits GTIN+prix sans image, mais le KPI les comptait « non
  publiables » → `lfp_feed_ready` faussement `false` au moment EXACT du go-live = faux négatif de readiness. Fix :
  thread le flag dans le KPI (parité OFF/ON testée ; OFF préservé byte-for-byte car publishable exige déjà l'image).
  **Règle (extension de D3) : réutiliser le prédicat du gate ne suffit pas si le gate a un comportement CONDITIONNEL
  (flag/env) — le KPI doit lire la MÊME condition, sinon il diverge dans l'état où la condition bascule.** Trouvé par
  SF-hunter ; vérifié par grep (les 2 feeds passent bien le flag). (readiness, 2026-06-23)
- ✅ **Rendre la readiness pilote PROGRAMMATIQUE plutôt qu'un doc** : un seuil métier (Google LFP « ≥11 offres »)
  qui ne vit que dans la prose = invérifiable + dérive. Encodé en source unique (`LFP_MIN_PUBLISHABLE_OFFERS`,
  `evaluateFeedReadiness`) + exposé par l'API → la checklist go-live lit un champ (`lfp_feed_ready`) au lieu d'un
  comptage manuel. Avant de coder : grep le « bouton » supposé manquant — « Request inventory verification » est une
  action côté Google MC du marchand, PAS du software à construire (prémisse corrigée, classe D6). (readiness, 2026-06-23)
- ❌ Sur un cron multi-marchand, le SELECT de la LISTE (`google_merchant_connections`) qui avale son
  `error` est PIRE qu'un select par-marchand avalé : un blip DB → `data=null` → `length===0` →
  `200 "aucun marchand connecté"` = TOUT le feed Google abandonné, 0 Sentry, 0 statut. **Règle : le
  read qui décide « rien à traiter » doit distinguer erreur de vide (throw/500 + captureError) — le
  blast radius d'un select de liste avalé = tous les items.** (Finding 2 silent-failure-hunter, maillon 7)

## Crons multi-marchands — SELECT de liste avalé (jumeau oublié)
- ❌ **Une garde anti-silent-failure posée sur UN cron et oubliée sur son JUMEAU.** `cron/google-feed`
  destructurait `error` sur le SELECT de la liste `google_merchant_connections` (fix maillon 7) mais
  `cron/google-status` (le read-back qui rend visible le faux positif n°1 « sur Google alors que rejeté »)
  faisait encore `const { data: connections } = …` → blip DB → `data=null` → `length===0` → `200 "No
  Google-connected merchants"` = **tout le read-back abandonné pour TOUS les marchands**, 0 Sentry → le contrôle
  s'aveugle lui-même sur un hoquet DB. **Règle (re-confirmée) : quand on durcit un cron à boucle multi-marchand,
  grep les N crons jumeaux qui lisent la même liste — le SELECT de liste avalé a un blast radius = tous les items.**
  Fix : garde `connectionsErr` → captureError + 500 AVANT le check « vide ». (`cron/google-status`, 2026-06-23, SF-hunter SOUND)
- ⚖️ **Bloc gated inerte = landmine, pas hors-scope** : le bloc `GOOGLE_DISAPPROVAL_ALERTS=1` de google-status
  avalait `error` sur le read de dédup `quality_alerts` (→ `open ?? []` → ré-insertion en double à chaque cron) ET
  sur l'INSERT. Inerte en prod (flag OFF + 106 non appliquée) mais se déclenche à l'activation D2. Corrigé dans le
  même run/fichier (même classe) : read err → captureError + **skip la persistance** (pas de dédup en aveugle) ;
  insert err → captureError **sans throw** (persistance secondaire après le signal Sentry critique). (2026-06-23)

## Résolution de jeton d'auth machine — erreur DB ≠ jeton inconnu (canal sans-caisse)
- ❌ **Une résolution de jeton d'auth qui avale l'erreur DB sert un blip transitoire comme « jeton
  invalide » (401) → l'émetteur automatisé croit son jeton révoqué et CESSE d'émettre = perte silencieuse.**
  `resolveIngestToken` (`POST /api/ingest/stock`, LE canal stock des marchands SANS caisse) faisait
  `const { data } = …maybeSingle()` → blip DB → `data=null` **indistinct du vrai no-match** → route 401
  « Invalid ingest token » → la caisse/cron du marchand arrête de pousser son stock. Un 401 = « ton jeton
  est définitivement mauvais » ; un hoquet DB transitoire mérite **500 (l'émetteur RÉESSAIE)**. Fix :
  destructurer `error`, `if (error) throw` → la route (try/catch) → 500 + captureError ; `.maybeSingle()`
  rend `error:null` à 0 ligne donc un vrai jeton inconnu reste un 401 légitime. **Règle (même classe que
  maillon 8 / `resolveWebhookProduct` / inbound-email) : dans un auth/lookup d'un canal machine, erreur DB ≠
  no-match → 500 (retry), réserver le 401/200 bénin au VRAI no-match.** Caller unique → throw sûr (atterrit
  dans le catch existant). (`token.ts`, 2026-06-23, revue SF-hunter SOUND)
- ✅ **Couvrir le route handler `POST /api/ingest/stock` au niveau ROUTE** (pas que le cœur métier déjà testé) :
  `tests/ingest-stock-route.test.ts` drive le VRAI `resolveIngestToken` (admin mocké au seul niveau réponse DB)
  → prouve blip DB→500 (PAS 401), jeton absent/inconnu→401, rate-limit, mapping des 8 outcomes→HTTP, lecture
  corps brut vs multipart. **Multipart en test** : `request.formData()` d'undici jette une assertion d'instance
  `File` en env de test → stuber un faux request exposant `formData()` qui rend un vrai `File` (couvre la BRANCHE
  du handler sans le ré-parseur undici). (2026-06-23)

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
