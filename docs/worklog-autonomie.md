# Worklog autonomie — Two-Step

Journal des sous-étapes menées en autonomie. Le plus récent en haut.
Format par entrée : date · sous-étape · fait · trouvé · décidé · testé · reste / questions.

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
