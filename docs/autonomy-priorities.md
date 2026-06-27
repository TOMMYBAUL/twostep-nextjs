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
**CORRECTION 2026-06-23** (l'ancien texte « LFP en limbo, rien ne le débloque » était FAUX — cf
[[google-lfp-etat]] / mails Google avril 2026) :
1. **Google LFP n'est PAS bloqué.** Google a TOUT débloqué en avril (tickets 5-9519000040422 /
   6-7242000040976, MC 5755722759) : revue **en parallèle** du recrutement, l'**email = candidature
   formelle**, vérification **à distance par sondage**, et **on PEUT pousser l'inventaire via
   Content/Merchant API MAINTENANT, avant le statut Trusted**. Le vrai blocage = **NOTRE EXÉCUTION**
   (1 marchand pilote live sur le feed), PAS Google, PAS le code. Prérequis/marchand : Business
   Profile vérifié + lié au MC, >11 offres, feed quotidien ; Trusted = 5 marchands vérifiés.
2. **Zéro marchand encore** = le vrai prochain pas. Pilotes visés : **Deerskin + une 2e boutique
   multimarque (neuf)** au centre de Toulouse. **PAS de revente/seconde-main** (Prego écarté : pas
   de GTIN propre, `condition=used` → casse l'ancrage EAN + le match Google).

Donc la boucle rend le produit **prêt + compatible Google** ; Thomas amène le pilote. « Terminer le
projet » = pilote live sur le feed → vérifié → Trusted. Le software est le quasi-dernier blocage,
plus un mur Google externe.

---

## 1bis. ⭐ MISSION COURANTE — VALIDER LE WORKFLOW MAILLON PAR MAILLON

### ⭐⭐ PRIORITÉ N°1 (2026-06-27, Thomas) — MAILLON 9 : ENRICHISSEMENT (photo / marque / catégorie)
> **CE MAILLON N'A JAMAIS ÉTÉ PROUVÉ EN RÉEL et il est CASSÉ.** Les 8 maillons « prouvés » =
> le TUYAU (transport data). L'enrichissement (EAN → photo/marque/catégorie) n'en a jamais fait
> partie. **Premier test réel le 2026-06-27** (7 vrais codes-barres poussés + photos inspectées
> VISUELLEMENT — cf `docs/workflow-ingestion-enrichment.md`) :
> - **Photos : 6/7 FAUSSES** (Carhartt→colle Loctite, Bose→barbecue Moulinex, Ray-Ban→scanner
>   Zebra, Nike→prise élec, LEGO→Funko, VTech→LEGO). Seule la Coca (EAN frais) correcte.
> - **Vérif IA Claude Haiku ne bloque RIEN** (laisse passer une colle pour un pantalon) → **fail-open
>   probable = silent-failure**. C'est la garde censée empêcher ça.
> - **Marque null 7/7**. **Catégorie** : 2/7 mappés FR, 4/7 anglais, **1 faux** (Coca→home&garden).
> - **Score 0,90 → tout en pending** : rien ne se publie. Pour « exactitude = la promesse » (north-star),
>   c'est **rédhibitoire** : Google rejette un feed à photos fausses, et un marchand qui voit un barbecue
>   sur son casque s'en va. **Donc priorité ABSOLUE, avant tout retour au polish UI.**
>
> **⚠️ LA BARRE DE PREUVE (adaptée au fait que la boucle N'A PAS D'YEUX) — NON négociable :**
> Le bug a survécu car la boucle prouve par tests unitaires sur synthétique. Un test vert ≠ photo juste.
> Donc :
> 1. **Régression d'abord** : capturer le fail-open de la vérif IA dans un test — un FIXTURE de paires
>    `(nom produit, image manifestement fausse)` connues que la vérif DOIT rejeter. Ça se teste SANS yeux.
> 2. **Pas de vrai EAN = pas de preuve d'image.** La correctude d'une photo ne s'auto-certifie pas :
>    après chaque run d'enrichissement réel, **produire un rapport** `EAN → nom/catégorie/marque/photo_url`
>    que **Thomas** valide visuellement. La boucle NE coche PAS « photos OK » seule.
> 3. **Sous-tâches** (ordre conseillé) : (a) régression fail-open de la vérif Haiku ; (b) corriger la
>    stratégie de requête Serper (chercher le NUMÉRO EAN brut sur Google Images renvoie du bruit) ;
>    (c) extraction **marque** (cassée, null 7/7) ; (d) **mapping catégorie** anglais→taxo FR.
>
> **🚦 CE QUE LA BOUCLE PEUT vs NE PEUT PAS (séparer, sinon on refait le piège) :**
> - **PEUT seule (unit-testable, pas d'env live)** : la régression fail-open (1), la logique d'extraction
>   marque (c), le mapping catégorie (d), la stratégie de requête Serper en pur (formatage requête).
> - **EXIGE un env live (clés API Serper/EAN-Search/ANTHROPIC + serveur + Supabase)** : le test e2e photo
>   sur vrais EAN (b prouvé). **La Routine cloud actuelle est « code+tests seulement » → elle ne peut PAS
>   le faire.** Deux options pour Thomas : soit **upgrader l'env de la Routine** (secrets API + droit de
>   lancer le pipeline), soit garder le e2e photo en **run supervisé** (Thomas + Claude en session). Tant
>   que ce n'est pas tranché : la boucle fait (a)(c)(d) + la PRÉPARATION de (b), et **escalade le e2e**.
> - Garde-fous habituels : 0 migration prod, bornes sur les fixtures (EAN-Search = 100 req/mois en essai),
>   réversible.

### 🚧 FILTRE DE CAP (2026-06-23, Thomas) — À APPLIQUER AVANT DE CHOISIR TOUT TRAVAIL
> Phase A (8 maillons) + Phase D (D1-D7) sont FAITES. La boucle a commencé à **dériver** : durcir
> des chemins SECONDAIRES (pipeline factures, routes/crons déjà fonctionnels) = vrai travail mais
> **hors cap** = procrastination productive. STOP. **Avant chaque item, passe ce filtre :**
>
> **IN-SCOPE (le SEUL périmètre — le chemin critique vers le PILOTE) :**
> 1. Chemin **stock POS/CSV sans-caisse → ingest → identité/concordance → confiance/fraîcheur →
>    feed Google LFP (Voie A/B) → readiness LFP**. Déjà très mûr : n'y toucher QUE pour un vrai
>    signal Sentry/quality_alert, PAS pour « plus de couverture ».
> 2. **Onboarding marchand PILOTE = LE prochain [R] PRINCIPAL** : wizard/UI d'import + connexion,
>    **vue « % publiable »** par marchand (✅ `GET /api/google/stats`), **mode shadow/preview** (montrer
>    avant de publier, lecture-seule). C'est ce qui rend Deerskin onboardable. (Le rendu VISUEL = Thomas/Playwright.)
>    - ✅ **Backing data shadow/preview FAIT (2026-06-23)** : `GET /api/google/feed-preview` renvoie le payload
>      Google EXACT qu'on publierait (`would_publish`, via le vrai `transformProductToGoogle`) + `blocked` (causes
>      par produit) + `summary`, **lecture-seule, parité garantie** avec les 2 feeds live (même gate/population/
>      transform/store_code ; verrou `classifyFeedRow` ⟸ `isFeedEligible`). 2 silent-failures corrigés (MED-1 faux
>      positif `google_connected` sur blip ; MED-2 feed live Voie B `(products ?? [])` → XML vide silencieux). +11
>      tests (832→843), revue SF-hunter SOUND. **Reste = rendu VISUEL** (consommer l'endpoint dans l'UI) → Thomas.
> 3. **Préparer** les items GATED en attente de Thomas (D2 tier GTIN-only, D5 vérif image) — rien de plus.
> 4. **SCALE / VOLUME (Thomas 2026-06-23 — IN-SCOPE, prioritaire)** : les 8 maillons sont prouvés
>    sur de PETITES fixtures. Valider tout le chemin sur de GROS catalogues **synthétiques (10k→50k
>    produits)** : pagination complète des adapters (Zettle/Square notamment), **mémoire du feed**
>    (`lfp-xml` construit TOUT en RAM → risque sur 50k items), **batch upserts** stock, **timeouts**
>    des routes/crons (Vercel ~max), réconciliation qui lit tout le catalogue. **Preuve** : ingest +
>    feed + réconciliation sur N milliers, **0 perte, 0 timeout**, mesure du temps/mémoire. Pilote-
>    pertinent : une boutique multimarque = des **milliers** de SKU (Deerskin). C'est le prochain [R].
> 5. **DÉMOS via le VRAI workflow (Thomas 2026-06-23) — IN-SCOPE** : remplacer les boutiques démo
>    hand-fakées (`demo-data.ts`, images « à tout va ») par des **marchands démo générés EN PASSANT
>    PAR LE PIPELINE RÉEL** (catalogue réaliste → ingest → enrichissement cascade → **images réelles
>    via OBF/KicksDB/Serper + vérif** → vitrine publiée). **Une pierre deux coups : teste le workflow
>    + le scale ET produit des vitrines PRÉSENTABLES** pour démarcher. Réutiliser les catalogues du #4.
>    (Le JUGEMENT visuel final reste à Thomas/Playwright — la boucle produit la DATA, pas le rendu CSS.)
> 6. **PHASE E — matcher les 8 maillons à une UI ACCESSIBLE + IDIOTPROOF + PRO (Thomas 2026-06-24, NOUVELLE MISSION)** :
>    chaque maillon fonctionnel doit avoir un écran clair et utilisable par un commerçant non-technicien.
>    **Stack DÉJÀ optimale, NE PAS changer de lib** : Untitled UI React (Tailwind v4 + React Aria = WCAG
>    natif, design « expensive » out-of-the-box) — vérifié 2026-06-24 comme top choix pro+accessible. La
>    mission = l'UTILISER partout, pas en chercher une autre.
>    - ✅ **E1 — écran `dashboard/google` (vue % publiable + connexion Google + base shadow/preview) FAIT
>      (2026-06-24)** : helper pur `dashboard-view.ts` (`deriveStatsView`/`deriveConnectionView`) → la page rend des
>      états HONNÊTES (erreur+Réessayer, vide+CTA « Importer mon stock » = zéro cul-de-sac, spinner non infini) au lieu
>      d'un faux « tout va bien ». **3 faux positifs d'affichage corrigés** (statut HTTP ignoré → score disparu en
>      silence ; `error` de lecture connexion jeté → faux « pas connecté » ; 0 produit = cul-de-sac) **+2 handlers**
>      (`res.ok` non vérifié → bouton mort / faux « déconnecté », revue SF-hunter). ARIA (progressbar/status/alert/ul-li).
>      Preuve `tests/lib/google/dashboard-view.test.ts` (+14, 843→857). Revue SF-hunter SOUND. 0 migration, réversible.
>      **Reste = passe VISUELLE/responsive (Thomas + `ui-journey.mjs`)** + surfacer `lfp_feed_ready` dans l'UI (suivant).
>    - ✅ **E2 — surfacer la READINESS LFP dans l'UI (signal go-live) FAIT (2026-06-24)** : `/api/google/stats` CALCULAIT
>      déjà la readiness (`lfp_feed_ready` = seuil ≥11 offres publiables ATTEINT ET connecté, via `evaluateFeedReadiness`)
>      mais le marchand ne la VOYAIT pas. Helper pur `deriveReadinessView` (`dashboard-view.ts`, vue `hidden|ready|blocked`)
>      qui **ne recalcule pas** le verdict (trust `lfp_feed_ready` = anti-divergence) → carte en tête de l'écran Google :
>      « Prêt pour Google LFP » (vert, `role="status"`) ou « Bientôt prêt » avec les freins ordonnés (offres → connexion) +
>      hint `blocked_only_by_image` (« K produits ne manquent que d'une photo »). 1 LOW d'affichage corrigé (verdict
>      incohérent `ready`+`eligible_google=0` → `publishable:null`, jamais « Vos 0 offres dépassent le seuil »). Preuve
>      `dashboard-view.test.ts` (+10, **857→867**). Revue SF-hunter **SOUND** (6 concerns north-star). 0 migration, réversible.
>      **Reste = rendu VISUEL/responsive (Thomas + `ui-journey.mjs`)** + maillons E suivants (import/ingest, review enrichissement, onboarding).
>    - ✅ **E3 — écran « Mon stock » (import/ingest, pilier 1) honnête au CHARGEMENT FAIT (2026-06-25)** : même classe
>      d'honnêteté que E1, sur l'écran d'entrée du marchand pilote. `MyStockView` consommait `useProducts()` SANS lire
>      son champ `error` → un 500/blip DB sur `GET /api/products` → `products=[]` + `loading=false` → l'écran rendait
>      l'EmptyState « Aucun produit encore — Ajoutez votre premier produit » = **faux cul-de-sac** (un marchand qui
>      vient d'importer des milliers de SKU voit « 0 produit » et ré-importe en panique). Helper PUR `deriveStockListView`
>      (`src/lib/stock/stock-list-view.ts`, vue `loading|error|list|empty|no-results`) → branche `error` honnête
>      (`role="alert"` + Réessayer), jamais d'EmptyState sur load raté. **+1 MEDIUM pré-existant fermé (revue SF-hunter,
>      même écran/même classe)** : `useIncompleteProducts` avalait son `error` (`catch{}`) → sur échec, compteur « à
>      compléter » silencieusement 0 + pastille absente (marchand avec N fiches ne voit AUCUN signal) ; fix : expose
>      `error` (motif `useProducts`) + notice honnête « à compléter : impossible à charger ». Preuve `tests/lib/stock/
>      stock-list-view.test.ts` (+8, **867→875**, dont la RÉGRESSION load-échoué→error≠empty). Revue SF-hunter **SOUND**
>      (mapping cycle de vie correct, ferme le faux-OK principal + le secondaire, Réessayer sûr). 0 migration, réversible.
>    - ✅ **E4 — écran « Validation du catalogue enrichi » (review enrichissement) honnête au CHARGEMENT + ACTIONS FAIT
>      (2026-06-26, commit `1d950ec`)** : le Server Component `ReviewPage` faisait `const { data: products }` (l'`error` du
>      SELECT JETÉ) → un blip/500 DB → `products=null` → `?? []` → `ReviewTable` rendait l'EmptyState « Rien à valider ».
>      **Pire qu'un écran vide** : les fiches `pending_review` sont INVISIBLES en vitrine (gate 089/094) → un marchand à qui
>      l'écran ment « rien à valider » ne validera JAMAIS → catalogue muet en silence. Helper PUR `deriveReviewView`
>      (`src/lib/stock/review-view.ts`, vue `error|ready{counts,filtered}`) → la page distingue erreur du vide (captureError
>      + `loadError`), `ReviewTable` rend une erreur honnête (`role="alert"` + Réessayer) au lieu de l'EmptyState. **+1 HIGH
>      pré-existant fermé (revue SF-hunter, même écran/même classe = LESSON E1)** : `bulkValidate/validateOne/rejectOne` ne
>      vérifiaient PAS `res.ok` + `router.refresh()` inconditionnel → **faux succès** (un 500 sur /validate → UI rafraîchie
>      comme si validé, fiche reste `pending_review` = invisible, 0 signal) ; wrapper `runAction` ne rafraîchit QUE sur
>      `res.ok`, sinon `actionError` (`role="alert"`) ; sélection conservée sur échec (retry), vidée sur succès ; catch →
>      captureError + message. **+3 LOW/MED adjacents** : merchant SELECT error tracée (sauf PGRST116=0-ligne légitime),
>      pos_connections error tracée (non bloquante), PostgrestError (≠ instance Error) → forward `code/message/details` en
>      contexte Sentry (sinon `String()`=`"[object Object]"`). Preuve `tests/lib/stock/review-view.test.ts` (+6, **875→881**,
>      dont RÉGRESSION load-échoué→error≠empty, compteurs stables au changement de bucket, statut hors-bucket→pas de NaN).
>      **2 revues silent-failure-hunter SOUND** (chargement + delta actions). 0 migration, réversible. Pré-existant hors
>      scope noté : `auth.getUser()` double-destructure non gardée (classe codebase-wide, séparée). **Reste = rendu
>      VISUEL/responsive (Thomas + `ui-journey.mjs`)** + dernier maillon E (onboarding).
>    - ✅ **E5 — écran « Connexion POS » (onboarding, moitié CONNEXION) honnête au CHARGEMENT FAIT (2026-06-26)** :
>      `dashboard/stock/pos` = là où le marchand pilote branche sa caisse (moitié *connexion* du cap item 2 ; E3 a
>      couvert l'*import*). Même classe E1/E3/E4 : le Server Component faisait `const { data: merchant }` ET
>      `const { data: connection }` (errors JETÉS) → **2 faux positifs sur un blip DB** : (1) marchand-null →
>      `redirect("/devenir-marchand")` **éjecte un marchand onboardé** ; (2) connexion-null → « Aucune caisse
>      connectée » à un marchand **déjà connecté** → re-connexion/doublon (finding E1). Helper PUR
>      `derivePosConnectionView` (`src/lib/stock/pos-connection-view.ts`, vue `error|no-merchant|ready`) →
>      `merchantFailed→error` (jamais redirect), `!hasMerchant→no-merchant` (redirect légitime), `connectionFailed
>      →error` (jamais « aucune caisse »), count-échoué→`productsCount:null` (« — », jamais faux 0) ; page rend
>      erreur honnête (`role="alert"`+Réessayer) + `captureError` (forward PostgrestError). Handlers d'action
>      (`handleSync`/`handleDisconnect`) gataient DÉJÀ `res.ok` → rien à corriger. Preuve `tests/lib/stock/
>      pos-connection-view.test.ts` (+9, **881→890**, 2 RÉGRESSIONS : marchand-échoué→error≠redirect, connexion-
>      échouée→error≠« aucune caisse »). Revue SF-hunter **SOUND**. Résiduel pré-existant codebase-wide (E4-cohérent,
>      séparé) : `auth.getUser()` error non gardée → redirect login silencieux. 0 migration, réversible. **Reste =
>      rendu VISUEL/responsive de tous les écrans E (Thomas + `ui-journey.mjs`).**
>    - **LA BOUCLE FAIT (vérifiable, code)** : pour chaque maillon (import/ingest stock, vue % publiable,
>      shadow/preview via `feed-preview`, review enrichissement, connexion Google, onboarding) → **états
>      vides** (« aucun produit — connecte ta caisse »), **chargement**, **erreurs + validation claires**,
>      **textes de guidage**, **CTA évidents**, **zéro cul-de-sac**, **labels/ARIA**. **Preuve** :
>      `ui-journey.mjs` (ariaSnapshot = a11y, overflow/max-width = layout) + tests. Token-léger.
>    - **SUPERVISÉ (Thomas + Claude-in-Chrome sur Edge / Playwright)** : le JUGEMENT « pro vs moyen », le
>      responsive, la beauté. Outil = skill **design-from-reference** (s'active si un écran est « moyen/
>      plat/amateur »). **La boucle ne tranche JAMAIS le visuel** (pas d'yeux — cf. OUT-OF-SCOPE).
>
> **OUT-OF-SCOPE / INTERDIT sans GO Thomas :**
> - ❌ **Responsive / rendu CSS à l'aveugle** : la boucle n'a PAS d'yeux (pas de navigateur) → toucher
>   le visuel/responsive (surtout `/discover`) = **SUPERVISÉ (Thomas + Playwright)**, jamais en
>   autonomie (changer du CSS sans voir = casser au hasard).
> - ❌ Le **pipeline FACTURES fournisseurs → stock** (`parseInvoice`, activate/cancel invoice,
>   invoice_items) = **ANCIENNE idée, hors cap.** Ne PAS le durcir.
> - ❌ **Couverture/durcissement de routes/crons déjà fonctionnels** « parce que non testés »
>   (couverture pour la couverture). Le gate est vert ; ce n'est pas le goulot.
> - ❌ Tout nouveau feature hors du chemin pilote.
>
> **RÈGLE ANTI-DÉRIVE / IDLE SILENCIEUX :** si **aucun [R] IN-SCOPE** ne reste → **NE PAS se
> rabattre sur du hors-cap, et NE PAS committer de note d'idle** (ça pollue l'historique ET
> déclenche une notif inutile). **Idle = 0 code, 0 commit, sortie SILENCIEUSE.** UNE SEULE fois
> (la 1re fois que tu constates l'épuisement), écris dans `logs/notify-extra.txt` : « plus de [R]
> in-scope — valeur = pilote (Thomas) + décisions gated ; RECOMMANDE de réduire la cadence » (le
> wrapper l'envoie UNE fois). Les runs idle SUIVANTS = **totalement silencieux** (le wrapper ne
> notifie plus sans commit ni escalade). **Un idle silencieux vaut mieux que du busywork OU du spam.**
> Auto-check : si le score **Align < 9**, c'est probablement hors-cap → stop, re-choisir ou idle.
>
> **🟢 ÉTAT 2026-06-23 (run autonome) — IDLE HONNÊTE ATTEINT, RÈGLE APPLIQUÉE.** Sourcing §6 refait :
> backlog A+D épuisé, **signaux réels vérifiés en DB prod** (quality_alerts = data SYNTHÉTIQUE de test, pas
> un défaut ; 0 marchand réel = 0 signal in-scope), couverture = hors-cap. **Aucun `[R]` in-scope ne reste.**
> Conclusion conforme : escalade (notify-extra) + reco cadence, **PAS de dérive**. **Prochain run : si même
> état (0 [R] in-scope, 0 signal réel), RE-IDLE — ne pas se rabattre sur du hors-cap.** La valeur est chez
> Thomas (GO merge des 39 commits gelés / validation visuelle UI / pilote).
>
> **🟢 ÉTAT 2026-06-23 (run autonome #2) — RE-IDLE HONNÊTE, état RE-VÉRIFIÉ EN PROD (pas trust du run #1).**
> Requêtes DB ce run : `merchants`=9 TOUS seed/test (« L'Atelier de Léa »…« TEST PAY »/« TESTE SIGNUP », créés
> en lot 18/04, aucun depuis) ; `google_merchant_connections`=0 ; `quality_alerts`=106 = cron qualité sur
> catalogue DORMANT (`stock_stale`×104 = TOUS les produits, +1 `price_aberrant`, +1 `pos_disconnected`, daté
> 22/06 05:00) = **signature d'un catalogue test inerte, pas un défaut**. **0 [R] in-scope, 0 signal réel
> frais.** RE-IDLE conforme. **Nouveau** : la reco cadence (run #1) n'a pas encore été appliquée (cron ~toutes
> les 30 min, 12 runs le 23/06) → escalade renforcée = **METTRE EN PAUSE / espacer le cron** (grignote le quota
> abonnement partagé pour 0 valeur). Prochain run même état → RE-IDLE, ne PAS re-notifier en boucle.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #4) — RE-IDLE, vérif prod PLUS PROFONDE que #3.** Ce run j'ai décomposé les 9
> marchands un par un (4 tests paiement/signup + 5 seed du 18/04, **aucun créé depuis le 25/04, 0 marchand réel**) et
> inspecté les tables jobs que #3 n'avait pas vues : `enrichment_jobs`=vide, `image_jobs`=103 pending **mais stale
> depuis le 23/04** (dépend clé ANTHROPIC déjà escaladée D5). `google_conns`=0, `quality_alerts` 0 frais (max 22/06).
> **0 [R] in-scope, 0 signal réel.** RE-IDLE conforme, 0 code, 0 re-notif (escalades merge+cadence déjà posées).
> **4e run zéro-valeur consécutif** → la pause/espacement du cron est de plus en plus justifiée. Prochain run même
> état → RE-IDLE, ne PAS dériver, ne PAS re-notifier.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #5) — RE-IDLE, prod re-vérifiée (1 requête, run cheap).** Identique à #3/#4 :
> `merchants`=9 (0 depuis 01/05, tous seed/test), `google_conns`=0, `enrichment_jobs`=0, `quality_alerts`=106 max
> 22/06 (rien frais), `pos error`=1 (Square test 23/04), `image_jobs`=103 stale 23/04 (clé ANTHROPIC, escaladée D5).
> **0 [R] in-scope, 0 signal réel.** 0 code, 0 re-notif. CFR 10 runs = 100 %. Observation : cron ~30 min = burn quota
> pour 0 valeur → pause/espacement (escaladé #2) toujours non appliqué. Prochain run même état → RE-IDLE, ne pas dériver.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #6) — RE-IDLE, prod re-vérifiée (1 requête consolidée, run cheap).** Identique à
> #3/#4/#5 : `merchants`=9 (latest 25/04, tous seed/test), `google_conns`=0, `quality_alerts`=106 max 22/06 avec
> **0 frais sur 24 h**, `pos error`=1 (Square test), `enrichment_jobs` pending=0. **0 [R] in-scope, 0 signal réel frais.**
> Backlog A 1→8 ✅ + Phase D D1–D7 ✅ + readiness LFP (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+escaladés.
> Reste = VISUEL (Thomas) / GATED (escaladé). 0 code, 0 re-notif (escalades merge + pause-cron déjà envoyées ; vider
> notify = preuve d'envoi). CFR 10 runs = 100 %. **6e run zéro-valeur consécutif** → la pause/espacement du cron
> (escaladé #2, non appliqué) est la SEULE action à valeur, et elle est chez Thomas. Prochain run même état → RE-IDLE.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #7) — RE-IDLE, prod re-vérifiée moi-même (1 requête consolidée, run cheap).**
> Identique à #3–#6 : `merchants`=9 (latest **25/04**, tous seed/test, 0 réel depuis ~2 mois), `google_conns`=0,
> `quality_alerts`=106 max **22/06 05:00** avec **0 frais sur 24 h**, `enrichment_jobs` pending=0, `image_jobs`=103
> stale **23/04** (clé ANTHROPIC, escaladée D5). **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅ + D1–D7 ✅
> + readiness (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+escaladés. Reste = VISUEL (Thomas) / GATED.
> 0 code, 0 re-notif (notify-extra absent = escalades merge + pause-cron déjà envoyées). CFR 10 runs = **100 %**.
> **7e run zéro-valeur consécutif.** Auto-régulation OK (coût idle en baisse : ~3,1→2,7 $). La pause/espacement du
> cron (escaladé #2, non appliqué) reste la SEULE action à valeur, chez Thomas. Prochain run même état → RE-IDLE.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #8) — RE-IDLE, prod re-vérifiée moi-même (1 requête consolidée, run cheap).**
> Strictement identique à #3–#7 : `merchants`=9 (latest **25/04**, tous seed/test, 0 réel depuis ~2 mois),
> `google_conns`=0, `quality_alerts`=106 max **22/06 05:00** avec **0 frais sur 24 h**, `enrichment_jobs` pending=0,
> `pos error`=1 (Square test 23/04), `image_jobs`=103 pending stale (clé ANTHROPIC, escaladée D5). **0 [R] in-scope,
> 0 signal réel frais.** Backlog A 1→8 ✅ + D1–D7 ✅ + readiness (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+
> escaladés. Reste = VISUEL (Thomas) / GATED. 0 code, 0 re-notif (`notify-extra` absent = escalades merge + pause-cron
> déjà envoyées). CFR = **100 %**. **8e run zéro-valeur consécutif.** La pause/espacement du cron (escaladé #2, non
> appliqué) reste la SEULE action à valeur, chez Thomas. Prochain run même état → RE-IDLE, ne pas dériver, ne pas re-notifier.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #9) — RE-IDLE, prod re-vérifiée moi-même (1 requête consolidée, run cheap).**
> Strictement identique à #3–#8 : `merchants`=9 (latest **25/04**, tous seed/test, 0 réel depuis ~2 mois), `google_conns`=0,
> `quality_alerts`=106 max **22/06 05:00** avec **0 frais sur 24 h**, `pos error`=1 (Square test), `enrichment_jobs` pending=0,
> `image_jobs`=103 pending stale (clé ANTHROPIC, escaladée D5). **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅ +
> D1–D7 ✅ + readiness (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+escaladés. Reste = VISUEL (Thomas) / GATED.
> 0 code, 0 re-notif (`notify-extra` absent = escalades merge + pause-cron déjà envoyées). CFR 10 runs = **100 %** (0 revert ;
> coût idle en baisse continue ~2,1 $). **9e run zéro-valeur consécutif.** La pause/espacement du cron (escaladé #2, non
> appliqué) reste la SEULE action à valeur, chez Thomas. Prochain run même état → RE-IDLE, ne pas dériver, ne pas re-notifier.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #10) — RE-IDLE, prod re-vérifiée moi-même (1 requête consolidée, run cheap).**
> Strictement identique à #3–#9 : `merchants`=9 (latest **25/04**, tous seed/test, 0 réel depuis ~2 mois), `google_conns`=0,
> `quality_alerts`=106 max **22/06 05:00** avec **0 frais sur 24 h**, `enrichment_jobs` pending=0, `image_jobs`=103 pending
> stale (clé ANTHROPIC, escaladée D5), `pos error`=1 (Square test). **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅
> + D1–D7 ✅ + readiness (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+escaladés. Reste = VISUEL (Thomas) / GATED.
> 0 code, 0 re-notif (`notify-extra` absent = escalades merge + pause-cron déjà envoyées). CFR 10 runs = **100 %** (0 revert).
> **10e run zéro-valeur consécutif.** ~10 runs × ~2,5 $ notionnels de quota brûlés pour 0 valeur produit → la pause/espacement
> du cron (escaladé #2, jamais appliqué) est la SEULE action à valeur et elle est chez Thomas. Prochain run même état → RE-IDLE.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #11) — RE-IDLE, prod re-vérifiée moi-même (1 requête consolidée, run cheap).**
> Strictement identique à #3–#10 : `merchants`=9 (latest **25/04**, tous seed/test, 0 réel depuis ~2 mois), `google_conns`=0,
> `quality_alerts`=106 max **22/06 05:00** avec **0 frais sur 24 h**, `enrichment_jobs` pending=0, `image_jobs`=103 pending
> stale (clé ANTHROPIC, escaladée D5), `pos error`=1 (Square test). **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅
> + D1–D7 ✅ + readiness (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+escaladés. Reste = VISUEL (Thomas) / GATED.
> 0 code, 0 re-notif (`notify-extra` absent = escalades merge + pause-cron déjà envoyées). CFR 10 runs = **100 %** (0 revert).
> **11e run zéro-valeur consécutif.** L'auto-régulation a atteint sa limite : la boucle re-vérifie honnêtement et conclut
> correctement, mais le cron continue de la réveiller ~toutes les 30 min sur un état figé → ~11 runs de quota brûlés pour 0
> valeur. La SEULE action à valeur reste la pause/espacement du cron (escaladé #2, jamais appliqué) — chez Thomas. Prochain
> run même état → RE-IDLE, ne pas dériver, ne pas re-notifier.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #12) — RE-IDLE, prod re-vérifiée moi-même (1 requête consolidée, run cheap).**
> Strictement identique à #3–#11 : `merchants`=9 (latest **25/04**, tous seed/test, 0 réel depuis ~2 mois), `google_conns`=0,
> `quality_alerts`=106 max **22/06 05:00** avec **0 frais sur 24 h**, `enrichment_jobs` pending=0, `image_jobs`=103 pending
> stale (clé ANTHROPIC, escaladée D5), `pos error`=1 (Square test). **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅
> + D1–D7 ✅ + readiness (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+escaladés. Reste = VISUEL (Thomas) / GATED.
> 0 code, 0 re-notif (`notify-extra` absent = escalades merge + pause-cron déjà envoyées). CFR 10 runs = **100 %** (0 revert).
> **12e run zéro-valeur consécutif.** Diagnostic inchangé depuis #11 : la boucle re-vérifie honnêtement et conclut
> correctement, mais le cron continue de la réveiller sur un état figé → la SEULE action à valeur reste la pause/espacement
> du cron (escaladé #2, jamais appliqué) — chez Thomas. Prochain run même état → RE-IDLE, ne pas dériver, ne pas re-notifier.
>
> **🟢 ÉTAT 2026-06-23 (run autonome #13) — RE-IDLE, prod re-vérifiée moi-même (1 requête consolidée, run cheap).**
> Strictement identique à #3–#12 : `merchants`=9 (latest **25/04**, tous seed/test, 0 réel depuis ~2 mois), `google_conns`=0,
> `quality_alerts`=106 max **22/06 05:00** avec **0 frais sur 24 h**, `enrichment_jobs` pending=0, `image_jobs`=103 pending
> stale (clé ANTHROPIC, escaladée D5), `pos error`=1 (Square test). **0 [R] in-scope, 0 signal réel frais.** Backlog A 1→8 ✅
> + D1–D7 ✅ + readiness (a) ✅ + backing data onboarding ✅ ; D2/D5 préparés+escaladés. Reste = VISUEL (Thomas) / GATED.
> 0 code, 0 re-notif (`notify-extra` absent = escalades merge + pause-cron déjà délivrées). CFR 10 runs = **100 %** (0 revert).
> **13e run zéro-valeur consécutif.** Diagnostic inchangé : la boucle conclut correctement mais le cron la réveille sur un état
> figé → la SEULE action à valeur reste la pause/espacement du cron (escaladé #2, non appliqué) — chez Thomas. Prochain run
> même état → RE-IDLE, ne pas dériver, ne pas re-notifier.

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
6. 🔶 **Affichage** — **READ-PATH/HONNÊTETÉ PROUVÉ (2026-06-22)** ; **VISUEL escaladé à Thomas** (pas de
   navigateur côté boucle). Prouvé : honnêteté du **prix promo** sur tout le hot path consumer. Bug réel
   corrigé (garde asymétrique write→read) : `POST /promotions` garde `sale_price < price` à la création mais
   le prix produit peut BAISSER ensuite sous une promo active → faux rabais (« -X% » négatif, prix promo >
   prix réel). Helper pur unique `honestSalePrice` (`src/lib/products/sale-price.ts`) appliqué aux **6 routes
   émettrices** (`products/discover`, `discover`, `by-merchants`, `search`, `feed/promos`, `products/[id]`).
   2 revues silent-failure-hunter (SOUND + 1 LOW adressé : prix null/0 → captureError). +9 tests, 0 migration.
   **Reste maillon 6 = rendu visuel** (accueil→onboarding→upload→dashboard→vitrine, « grossier vs pro ») →
   **B ci-dessous, à valider par Thomas au navigateur**. Suivi non bloquant : `shop-profile` lit `promotions`
   côté client (hors source unique serveur).
7. ✅ **Sortie Google LFP (gate honnête)** — **PROUVÉ (2026-06-22)**. Preuve réelle
   `tests/ingest-maillon7-google-feed-gate.test.ts` (+6, faux client read-side qui applique `.eq/.is`) :
   le GATE des 2 canaux Google (Voie A cron Content API + Voie B XML crawlé) exercé sur le CHEMIN RÉEL,
   pas juste la fonction pure. **Bug réel corrigé (faux positif de sortie, divergence Voie A/B)** : Voie B
   filtrait `visible AND validated` seulement vs Voie A `+ archived_at IS NULL + variant_of IS NULL` ;
   `archive_product` (RPC 068) met `archived_at` SANS toucher `visible` → un produit archivé restait
   annoncé au crawler Google (catalogue fantôme) → parité de gate (les 2 canaux émettent le MÊME ensemble).
   3 silent-failures clos (revue silent-failure-hunter) : SELECT products avalé (skip muet du marchand),
   SELECT de LISTE connections avalé (200 silencieux = tout le feed abandonné), fallback store_code tracé.
   0 migration, réversible. NB : câbler `pushInventoryToGoogle` sur le file-push reste `[G]` (écriture
   externe sous compte Google marchand — escaladé).
8. ✅ **Email-in (canal stock de bout en bout)** — **PROUVÉ (2026-06-22)**. Preuve réelle
   `tests/ingest-maillon8-email-in.test.ts` (+10) : on drive la VRAIE route `POST /api/inbound-email`
   avec un payload Resend `email.received` signé HMAC + une pièce jointe CSV FR sale (base64). Prouvé :
   signature→401, routage canal stock, **décodage base64 sans perte** (buffer reçu == CSV d'origine
   octet pour octet), contrat snapshot-unique (multi-fichiers → captureError + 0 ingestion). **2 bugs
   réels corrigés (perte silencieuse n°1, classe `resolveWebhookProduct`)** : (a) résolution
   `merchants.inbound_email_slug` avalait son `error` → blip DB → `200 "no matching merchant"` → Resend
   ne réessaie jamais → email stock perdu ; fix : erreur DB ≠ no-match → `captureError`+500 (retry),
   slug inconnu = 200 bénin. (b) `resend.emails.get` `{data:null,error}` → `attachments=[]` → faux
   « no attachment »+200 → CSV perdu ; fix : throw→500 (retry). Revue silent-failure-hunter : SOUND
   (fix a) + finding b corrigé. 0 migration, réversible. → **CHAÎNE DATA A : maillons 1→8 ✅ COMPLÈTE.**

**B — UI réelle (Playwright sur l'app live)** : parcours accueil → onboarding → upload stock →
dashboard → vitrine + badge confiance. Screenshots. Lister sans complaisance ce qui est
« grossier »/amateur vs pro. (= maillon 6 Affichage prouvé pour de vrai.)

**C — (déjà amorcé)** : cette section EST l'encodage de la méthode dans le cerveau de la boucle.
Maintenir à jour ; ne pas régresser vers le « grossier ».

> Tant que A n'est pas prouvé maillon par maillon, NE PAS partir sur du nouveau feature.
> Chaque run : reprendre le 1er maillon `⬜` non prouvé, le finir avec preuve, cocher, worklog.

> **✅ CHAÎNE A 1→8 COMPLÈTE (2026-06-22).** Tous les maillons data sont prouvés de bout en bout
> avec preuve réelle + bugs réels corrigés. **Reste de la mission §1bis** : plan **B** (validation
> VISUELLE de l'UI au navigateur — maillon 6 visuel/Playwright) = **hors périmètre boucle (pas de
> navigateur) → escaladé à Thomas**. **Prochain travail boucle = Phase D ci-dessous.**

### ⭐ PHASE D (2026-06-23) — COMPATIBILITÉ GOOGLE MERCHANT + RÉADAPTATION ENRICHISSEMENT
> **Pourquoi** : décisions de la session 2026-06-22/23. Google a tout débloqué (cf §1 corrigé +
> [[google-lfp-etat]]) et **on peut pousser via Content/Merchant API maintenant**. Le modèle
> d'enrichissement **s'appuie sur Google pour la tête de catalogue** (trick NearSt : GTIN propre →
> Google remplit nom/image sur SES surfaces) — donc **ne PAS sur-enrichir nous-mêmes les produits
> populaires pour le feed Google** ; concentrer NOTRE enrichissement sur (a) notre app, (b) la
> traîne FR, (c) les images anti-rejet. **Stock/prix = toujours nous.** Même MÉTHODE (preuve par
> maillon). Objectif : **être réellement compatibles Google + prêts pour un pilote live**.
>
> - ✅ **D1 `[R]` Audit complétude feed Google — PROUVÉ (2026-06-23, commit `ecfbd9b`)**.
>   `g:sale_price`/`salePrice` AJOUTÉ aux 2 voies (trou promo fermé : les promos remontent enfin sur
>   Google) via helper pur unique `activeFeedSalePrice` (réutilise `honestSalePrice` = source unique du
>   « vrai rabais » ; promo émise UNIQUEMENT si active [fenêtre `starts_at`/`ends_at`] ET avantageuse ;
>   meilleur rabais si plusieurs). **Parité Voie A/B fermée** : (a) éligibilité centralisée
>   `isFeedEligible` (Voie A laissait passer `price=0` + EAN tronqué que Voie B rejetait → divergence
>   d'ensemble corrigée, même classe que store_code maillon 7) ; (b) `nowMs` capturé une fois par feed
>   (cohérence intra-feed). **Preuve réelle** : feed généré sur fixture (promo active) inspecté champ par
>   champ — les 2 voies émettent le MÊME ensemble + `99.99 EUR` (cf. worklog). +18 tests (632→644).
>   Revue silent-failure-hunter : north-star (faux positif promo→Google) **SOUND** (3 gardes composées).
>   0 migration, réversible. NB : `sale_price_effective_date` volontairement NON émis (feed = état
>   courant, re-push 3h/re-crawl 15 min, comme availability). **Suivi → D3** : observabilité « combien
>   filtrés par cause » (price=0/EAN court) = exactement le KPI D3, pas dupliqué ici.
> - 🔶 **D2 `[G]` Tier « GTIN-only → Google enrichit » — PRÉPARÉ + ESCALADÉ (2026-06-23, commit `81d17d1`)**.
>   Flag `GOOGLE_GTIN_ONLY_TIER` (OFF par défaut → 0 changement prod) : quand ON, les produits GTIN+prix
>   SANS image entrent dans le feed (Google enrichit la tête de catalogue depuis le GTIN). Source unique
>   `gtinOnlyTierEnabled` lue par les DEUX canaux (`feed.ts` Voie A + `lfp-xml.ts` Voie B) → parité préservée
>   (même ensemble émis dans les 2 états du flag, classe store_code/maillon 7). `imageLink` rendu optionnel
>   (omis quand pas d'image → `JSON.stringify` l'omet, jamais de `null`/balise vide rejetée par Google).
>   **Bug réel adjacent corrigé** (revue SF-hunter) : `hasImage` comptait `""` comme une image (`"" !== null`)
>   → produit éligible émettant un `g:image_link` VIDE (rejet Google) ; durci `!== "" `. **MESURE** : le trou
>   est déjà couvert (cron `google-status` lit `destinationStatuses` → `quality_alerts google_disapproved` ;
>   KPI D3 `blocked_only_by_image` = combien de produits ce tier ajouterait). Preuve `tests/lib/google/
>   gtin-only-tier.test.ts` (+16 : flag OFF/ON, relaxation image SEULE [GTIN/prix toujours requis], parité
>   A/B, `""`≠image). Revue SF-hunter : core SOUND, 0 silent-failure introduit. 705 tests, 0 migration,
>   réversible. **GO escaladé** (`notify-extra`) : activer le flag au 1er pilote (option A) vs garder OFF (B).
>   Ne PAS activer seul (réputation compte Google).
> - ✅ **D3 `[R]` Métrique « % publiable » — PROUVÉ (2026-06-23)**. `summarizePublishability`
>   (`src/lib/google/feed-eligibility.ts`) réutilise le VRAI gate du feed (`isFeedEligible` via 3 prédicats
>   partagés) → KPI qui ne peut PAS diverger de ce qui publie ; ventilé par cause + `blocked_only_by_image`
>   (cible D2/D5). **Bug réel corrigé (faux positif KPI, classe maillon 7)** : `/api/google/stats` comptait
>   « éligibles » via `ean && price!==null` → produits SANS image / prix 0 / GTIN tronqué que le feed rejette,
>   et population `visible=true` SEULEMENT (archivé resté visible compté publiable). Aligné sur le gate des
>   2 feeds + read-error→500+Sentry (fin du KPI all-zeros silencieux). Preuve `tests/lib/google/
>   publishability.test.ts` (+10, catalogue sale champ par champ + chemin réel route). Revue SF-hunter SOUND.
>   654 tests, 0 migration, réversible.
> - ✅ **D4 `[R]` Open Beauty Facts — DÉJÀ FAIT (vérifié 2026-06-23, retiré, zéro complaisance §5)**.
>   Vérifié dans le code réel (LESSONS ~70 % de faux findings) : OBF est **déjà entièrement câblé** dans la
>   cascade — `fetchFromOpenBeautyFacts` (`ean/lookup.ts`), reverse-search `searchEanByNameOpenBeautyFacts`,
>   agrégation `collectAllEanSources` (`tier2_obf` scoré 0.97), appelé par `fetchEanData`/`runCascade`. Et
>   « ne pas intégrer l'API GS1 payante » est **déjà respecté** : `gs1.ts` `lookupGs1` est inerte sans
>   `GS1_CODEONLINE_API_KEY` + tier Basic documenté à 0€. Item caduc → retiré. **Reste réel séparé** (image
>   anti-rejet GRATUITE) : `fetchFromOpenBeautyFacts`/`OpenProductsFacts` JETTENT l'image (`photo_url:null`,
>   « Serper handles photos ») alors que OBF/OPF exposent une image GTIN-keyée gratuite → trou « images
>   anti-rejet » (cf intro Phase D + `blocked_only_by_image` de D3). **Décision SOURCE-image = ambiguë** (le
>   commentaire dit Serper préféré pour la qualité) → à arbitrer avec D5 (gate CLIP) plutôt qu'en solo.
> - 🔶 **D5 `[R]` Gate de match image — DURCI + ESCALADÉ (2026-06-23)**. Prémisse « pas de gate / utiliser
>   CLIP » **partiellement fausse** (vérifié) : un gate existe déjà via `verifyPhotoWithAI` (Haiku vision,
>   `serper.ts`) ; le CLIP `clip-pipeline.ts` est un matching produit↔produit (Tier 4 identité), inadapté à
>   « image sourcée matche-t-elle ce NOM ». **Vrai trou comblé** : `verifyPhotoWithAI` **fail-openait en
>   `return true`** sur 3 échecs (clé absente / HTTP !ok / catch) = image publiée **sans preuve** (classe
>   `verifySIRET`). Or `ANTHROPIC_API_KEY` ABSENTE en prod → 100 % des images Serper publiées non vérifiées.
>   Fix : vérif ON + erreur → `false` (candidat écarté) + `captureError` ; vérif OFF (clé absente) → `true`
>   (compat) mais OBSERVABLE 1×/process ; + 2 `console.warn` Serper → `captureError`. Preuve
>   `tests/images-verify-photo.test.ts` (+5). Revue SF-hunter SOUND. 671 tests, 0 migration, réversible.
>   **Décision produit escaladée** (`notify-extra`) : A) clé ANTHROPIC prod (~0,001 $/img) [reco] vs B) bloquer
>   images non vérifiées vs C) accepter non vérifié + tracer. **Repli photo marchand** non couvert ce run
>   (dépend du choix A/B/C). NB : à arbitrer avec la SOURCE-image OBF/OPF gratuite (D4-suite).
> - 🔶 **D6 `[R]` Mode pilote « shadow/preview »** — **CONTRAT READ-ONLY STOCK PROUVÉ (2026-06-23)** ;
>   shadow/preview UI non entamé. Prémisse « aucun adaptateur n'écrit vers la caisse » **partiellement
>   fausse** (vérifié) : 2 writebacks CATALOGUE existent (`pushCatalog` sur validation facture ; `updatePosProduct`
>   EAN, flag `POS_WRITEBACK_ENABLED`) — mais **aucun n'écrit de QUANTITÉ DE STOCK** (la vraie promesse north-star).
>   **2 trous réels comblés** : (a) Square OAuth demandait `INVENTORY_WRITE` + Shopify `write_inventory` = scopes
>   d'écriture stock JAMAIS utilisés → le marchand voyait « peut modifier mon inventaire » au consentement (anti
>   moindre-privilège) ; retirés (`INVENTORY_READ`/`read_inventory` gardés pour `getStock` ; existants non affectés,
>   nouvelles autorisations seulement). (b) Shopify `pushCatalog` droppait un produit en SILENCE sur HTTP !ok →
>   jamais de `pos_item_id` → jamais de MAJ stock (perte silencieuse, finding SF-hunter MED) → `captureError`+continue.
>   **Test verrouillant** `tests/pos-readonly-stock-contract.test.ts` (+17) : A) aucun `getAuthUrl` ne demande
>   l'écriture d'inventaire ; B) aucun adaptateur n'expose de méthode d'écriture de stock ; C) `pushCatalog`/
>   `updatePosProduct` n'émettent aucune mutation de quantité (Square/Shopify/Lightspeed) + flag-gating writeback.
>   Revues SF-hunter + security-reviewer : scope removal **SOUND, 0 régression**. 0 migration, réversible.
>   **Reste D6** : shadow/preview UI (ingest marchand → montrer ce qu'on PUBLIERAIT avant publication) = chantier
>   B visuel → escaladé Thomas (pas de navigateur côté boucle). Suivi non bloquant : invariant read-only POS sur
>   resync/webhooks non testé en comportement (garde B couvre déjà l'absence de méthode d'écriture).
> - ✅ **D7 `[R]` Concordance EAN↔nom-marchand — PROUVÉ (2026-06-23)**. Trou réel comblé : le chemin
>   **forward** (EAN saisi → nom résolu par OBF/EAN-Search) n'avait AUCUN croisement avec le nom marchand
>   (seul le chemin reverse nom→EAN passait par `verifyEanMatchWithAI`) → un EAN mal saisi/réutilisé (barcode
>   reuse) résolvait une identité RÉELLE mais FAUSSE, auto-publiée en confiance d'un seul tier (0.90-0.99 ≥
>   0.95). Fix : garde pure `evalIdentityConcordance` dans `runCascade` (`scoreNameMatch(merchantName,
>   resolvedName, brand) ≥ 0.25`, seuil conservateur) → `buildCascadeOutcome` rétrograde `validated`→`pending`
>   (downgrade-only, jamais l'inverse ; score brut préservé pour traçabilité). **Appliqué aux DEUX points de
>   sortie** (chemin multi-source ET early-return CIP médicament — finding CRITIQUE-1 de la revue SF-hunter,
>   le cas le plus dangereux). Preuve `tests/lib/enrichment/cascade-engine.test.ts` + `score-cascade.test.ts`
>   (+12 : mismatch→pending malgré 0.97/0.985/0.99, concordant→validated, terse-cohérent→validated, CIP
>   mismatch, convergence mismatch, garde inerte sans nom). Revue SF-hunter : CRITIQUE-1 corrigé ; HAUTE-1
>   (asymétrie brand) **réfuté par calcul** (0.89 pas 0.22, overlap symétrique 60 %) ; HAUTE-2/MOYENNE
>   pré-existants orthogonaux différés. 666 tests, 0 migration, réversible.
>
> **READINESS (= ce que la boucle signale « prêt pour les marchands » via WhatsApp)** : D1+D3+D4+D5+
> D6+D7 prouvés (gate vert) + **D2 préparé/escaladé ✅ (2026-06-23)**.
> - ✅ **(a) Checklist go-live pilote — RÉDIGÉE + RENDUE PROGRAMMATIQUE (2026-06-23)**.
>   `docs/prospection/go-live-checklist.md` : maillons binaires (≥11 offres + connecté + feed quotidien
>   + actions Google externes du marchand). **Software ajouté** (pas qu'un doc) : le seuil LFP « ≥11 offres »
>   ne vivait QUE dans la prose → encodé en source unique `src/lib/google/pilot-readiness.ts`
>   (`LFP_MIN_PUBLISHABLE_OFFERS=11`, `evaluateFeedReadiness`) + exposé par `GET /api/google/stats`
>   (`lfp_feed_ready`, `lfp_meets_offer_threshold`, `lfp_offer_shortfall`, `google_connected`, `lfp_blockers`).
>   `publishable` réutilise le VRAI gate du feed (`isFeedEligible`) → readiness ne peut pas diverger de ce
>   qui publie. **Bug réel corrigé (revue SF-hunter HIGH, classe D3)** : `summarizePublishability` hardcodait
>   `allowMissingImage:false` alors que les 2 feeds passent `gtinOnlyTierEnabled()` → flag GTIN-only ON, le KPI
>   SOUS-COMPTAIT les produits sans image que le feed PUBLIE = faux « pas prêt » au moment exact du go-live
>   (D2 active ce tier au 1er pilote) ; fix : flag threadé dans le KPI, parité testée OFF/ON. +15 tests
>   (705→720). 0 migration, réversible.
> - **Reste avant le signal « prêt »** : (b) validation VISUELLE de l'UI (chantier B, Thomas, pas de
>   navigateur côté boucle). **Signal « prêt » à émettre dès qu'un marchand atteint `lfp_feed_ready=true`** →
>   notif « prêt — Deerskin + 2e boutique peuvent être onboardés ».
>
> **Gate irréversible** : la boucle construit sur `feat`. Passer en prod = merge→main+deploy = **GO
> Thomas** (ou supervisé sous mandat backup). La boucle NE merge/déploie PAS seule.

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
- `[G]` **NOUVEAU 2026-06-23** — **feed_event Zettle émis inconditionnellement (pollution feed sur write
  rejeté/retry)** : la route zettle insère un `feed_event` (restock/sale) à CHAQUE livraison même quand
  `update_stock_atomic` a no-opé (garde anti-régression 104 : `source_ts` entrant ≤ base) → un retry absolu
  ré-émet un event « sale » (type erroné, `previousQty==quantity`) = pollution du feed consumer. **Cause racine** :
  la RPC renvoie `v_previous` indistinctement en write-committé ET en stale-rejeté → la route ne peut pas savoir
  si elle a vraiment écrit. Fix propre = signal de skip dans la RPC (DROP+CREATE → **migration**, protocole §4),
  OU décision produit (« émet-on les ventes au feed comme Square ne le fait PAS ? » — Square ne pousse que les
  restock 0→positif). Square non affecté (gate restock-from-zero). Exposition NULLE (0 marchand Zettle). Trouvé
  par silent-failure-hunter au run de couverture des routes absolues. → préparer l'option (migration idempotente
  non appliquée + flag) puis ESCALADE le choix produit/GO.
- `[G]` **ESCALADÉ 2026-06-21** — **Idempotence webhook delta = at-most-once** (`webhook_events`
  inséré AVANT le traitement, Shopify/Lightspeed) : un échec de traitement + retry-dedup perd
  une VENTE. **Rendu VISIBLE** (Sentry, commit `8e5872f`) → plus silencieux. Choix de fond A
  (garder, perte rare tracée) vs B (at-least-once exactly-once = design + possible migration).
  **Exposition NULLE (0 marchand)** → urgence faible. En attente Thomas (`notify-extra`).

### Rang 3 — Réversible « nourriture » (à faire quand Rang 1-2 escaladé)
- ✅ **FAIT (2026-06-22, commit `4a03ca4`)** — **Vérif SIRET honnête** : `verifySIRET` fail-open en
  `valid:true` SANS signal (token absent = cas prod / 401 / 5xx / réseau) → faux positif « vérifié »
  silencieux. Pire : la route renvoyait `valid:false` au statut **400** mais les 2 forms testaient
  `res.status===404` (branche morte → introuvable/fermé passait en silence) ; et la route n'émettait
  ni `company` ni `pending` que les forms consomment → en prod **100 % des marchands créés `active`
  sans vérification** (machinerie pending wirée mais signal jamais propagé). Fix : `pending` honnête
  (non vérifié = pending, fail-open assumé mais DIT), captureError sur erreurs INSEE réelles (pas le
  no-token = config), sanitisation `[ND]` non-diffusible, route émet `{valid,pending,company}`, forms
  bloquent sur `!res.ok`. +2 silent-failures adjacents (catch forms, insert create-merchant). +12 tests.
  2 revues SOUND. **Escalade posée** (notify-extra) : `status:"active"` dérivé de metadata client (décision
  produit). 0 migration, réversible.
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
  **Partiel (run 2026-06-22 soir)** : **hot path facture→catalogue/stock couvert** —
  `POST invoices/[id]/validate` (CRÉE produits + ÉCRIT stock `source:"invoice"`) n'avait **0 test** et portait
  **7 pertes silencieuses réelles** (insert produit avalé → drop ; lecture stock/available_sizes avalée →
  écrasement par valeur partielle ; writes stock non vérifiés → faux succès ; MAJ statut + `catch{}` global
  sans Sentry). Toutes fermées (`captureError` + champ `errors`, comptage par succès réel, préservation sur
  lecture en échec). `tests/invoice-validate-writes.test.ts` (+8). Revue silent-failure-hunter : 4 fixes SOUND
  + 3 HIGH adjacents corrigés. Suivi non bloquant : re-validate non idempotent sur stock (pré-existant).
  **Partiel (run 2026-06-21 soir)** : **contrat d'orchestration `syncMerchantPOS` verrouillé**
  (`tests/pos-sync-engine-orchestrator.test.ts`, +5 tests, 0 prod-code) — invariant north-star
  « jamais un `success` silencieux quand un fetch/write échoue ; un hoquet POS transitoire
  n'efface JAMAIS le catalogue ; lock occupé → all-zeros sans effet de bord ». Revue
  typescript-reviewer : SOUND (tests non vacants, mocks fidèles aux vraies chaînes). Plus de
  hot path du sync POS non testé.
  **Partiel (run 2026-06-23, activateInvoice)** : **chemin facture→catalogue POS couvert** —
  `activateInvoice` (route live `POST /api/invoices/[id]/activate`, push `pushCatalog` + mapping `pos_item_id`)
  n'avait **0 test** et portait **1 perte silencieuse north-star + 4 adjacentes** : lecture `pos_connections` avalée
  → marchand POS pris pour non-POS → **catalogue jamais poussé** (facture `imported` en silence) ; reads
  `invoice_items`/`products`/`invoice` avalés (err≠vide/introuvable) ; mapping `pos_item_id` post-push avalé ; 3 MAJ
  statut avalées. Toutes fermées (throw+captureError pour les reads d'aiguillage ; captureError-sans-throw pour le
  mapping = anti doublon POS ; helper `markInvoiceImported`). `tests/invoice-activate-writes.test.ts` (+11). Revue
  silent-failure-hunter SOUND (3c `markProductsRedispo` réfuté = déjà non-throwing). 0 migration, réversible.
  **Partiel (run 2026-06-23, stock/receive)** : **chemin livraison reçue→stock couvert** — `POST /api/stock/receive`
  (route live, déplace `stock_incoming`→stock via RPC atomique `receive_stock_incoming`) n'avait **0 test** et portait
  **1 perte silencieuse north-star + 2 adjacentes** : la boucle `await rpc(...)` ne destructurait PAS `error` puis
  `received++` inconditionnel → marchand voit « N reçus / stock mis à jour » alors que la RPC a échoué (stock non
  incrémenté) = livraison perdue derrière voyant vert ; + 2 reads d'aiguillage (incoming, lookup marchand `.single()`)
  transformaient un blip DB en 404. Toutes fermées (captureError + `failed`, `received`=succès réels, échec total→500,
  partiel→200 honnête ; capture-and-continue sûr car RPC atomique/idempotente, ligne reste `incoming` re-cliquable).
  `tests/stock-receive-writes.test.ts` (+8). Revue SF-hunter SOUND (2 findings MED adjacents corrigés). 0 migration, réversible.
  **Partiel (run 2026-06-23, invoices/[id]/cancel)** : **chemin annulation→réversion stock couvert** — `POST /api/
  invoices/[id]/cancel` (réverse la marchandise reçue d'une facture annulée) n'avait **0 test** et portait **1 CORRUPTION
  + 3 pertes silencieuses** : (#1) appel à la RPC `increment_stock_quantity` **inexistante dans toute migration** → le
  fallback read-modify-write tournait à chaque appel et **forçait le stock à 0 sur un blip de lecture** (`max(0,(null??0)-
  delta)=0` = vraie qté écrasée) ; (#2) `update` de réversion avalé → stock non décrémenté mais facture remise `parsed` =
  stock fantôme gonflé ; (#3) reset-statut avalé ; (#4 revue SF-hunter) lecture `invoice_items` avalée → `stockDeltas={}` →
  fausse « annulée » sans réversion. Toutes fermées (helper `reverseStock` qui distingue erreur de vide et **n'écrit JAMAIS
  0**, captureError, 500 honnête sur échec partiel sans remettre la facture en `parsed`). `tests/invoice-cancel-writes.test.ts`
  (+10, TDD 5 rouges→vert). Revue SF-hunter : 0 silent-failure introduit ; résidu idempotence-au-retry **pré-existant** laissé
  hors scope (durcissement Rang 2). 0 migration, réversible.
  **Partiel (run 2026-06-23, route handlers WEBHOOK temps réel)** : **2e pilier north-star couvert** — `POST /api/
  webhooks/{shopify,lightspeed}` (canal stock temps réel) n'avait **0 test de bout en bout** (seuls les adapters/
  resolve en unité). +18 (`tests/webhook-routes-stock.test.ts`, 9 contrats × 2 jumeaux) drivant le vrai `POST` :
  signature→401 (0 effet), idempotence doublon→skip (0 décrément) / erreur→500, delta+`source="webhook"`+`source_ts`=
  heure événement câblés, resolve null→skip vs throw→500, recalc throw→200 (stock committé)+captureError, JSON
  invalide→400. **2 bugs réels corrigés** : (a) **fraîcheur Shopify** (classe garde cosmétique maillon 5) —
  `parseWebhookEvent` mettait `updated_at=now()` (réception) au lieu du timestamp order → faux « vu à l'instant »
  pour vente passée ; fix `updated_at||created_at||processed_at||now()` (Lightspeed/Square le faisaient déjà). (b)
  **HIGH recalc** (revue SF-hunter) — `await recalculateGroupSizesAdmin()` non gardé → throw réseau → 500 post-
  décrément → retry → idempotence skip → recalc perdu jusqu'au resync 6h ; fix captureError-et-continue sur les 2
  jumeaux. +4 tests parse (`processed_at` fallback). Revue SF-hunter SOUND. 776 tests (749→776), 0 migration, réversible.
  **Partiel (run 2026-06-23, cron `google-status`)** : **read-back du statut Google couvert au niveau ROUTE** —
  `cron/google-status` (relit `accounts/{account}/products`, rend visibles les rejets Google = contrôle du faux
  positif n°1) n'avait **0 test de route**. **1 bug réel (jumeau oublié de google-feed)** : le SELECT de la LISTE
  `google_merchant_connections` avalait son `error` → blip DB → `200 "No Google-connected merchants"` = tout le
  read-back muet pour TOUS les marchands (la garde maillon 7 était sur google-feed mais pas son jumeau). Fix :
  `connectionsErr` → captureError + 500. + 2 durcissements gated (`GOOGLE_DISAPPROVAL_ALERTS=1`, finding SF-hunter
  A/B : dédup-read avalé → doublons ; INSERT avalé) corrigés (skip persistance en aveugle / captureError sans throw).
  `tests/cron-google-status-route.test.ts` (+8). Revue SF-hunter SOUND. 800→808, 0 migration, réversible.
  **Partiel (run 2026-06-23, route `POST /api/ingest/stock`)** : **canal stock SANS-CAISSE couvert au niveau ROUTE** —
  le push de fichier par jeton (cœur « feed LFP as a service » pour caisses FR à API fermée, pilier 1 north-star)
  avait son cœur (`ingestStockFileForMerchant`) + chaîne snapshot (maillons 1→8) prouvés mais **0 test de route**.
  **1 silent-failure réel** (classe maillon 8 / `resolveWebhookProduct`) : `resolveIngestToken` avalait l'erreur DB
  (`const { data } = …maybeSingle()`) → blip DB indistinct d'un vrai « jeton inconnu » → **401 « Invalid token »**
  → la caisse/cron du marchand croit son jeton révoqué et CESSE de pousser = perte silencieuse. Fix : `if (error)
  throw` → route 500 + captureError (la caisse RÉESSAIE) ; vrai no-match → null → 401 préservé (caller unique, LOW).
  `tests/ingest-stock-route.test.ts` (+24) : RÉGRESSION blip→500 (PAS 401) via le VRAI resolver, jeton absent/
  inconnu→401, rate-limit, mapping des 8 outcomes→HTTP, lecture corps brut/multipart/Bearer. Revue SF-hunter SOUND
  (lectures adjacentes hash-read/lock-UPDATE vérifiées FAIL-SAFE → 0 action). 808→832, 0 migration, réversible.
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

### 5bis. ⭐ SCORECARD DE FIN DE RUN (obligatoire — Thomas le reçoit sur WhatsApp/Telegram)
À CHAQUE run qui produit du travail, **s'auto-noter HONNÊTEMENT** (une note basse est un SIGNAL
utile, pas un échec ; Thomas/Claude-supervisé audite). 5 axes, **note 1-10** — repère DUR (le /5 saturait ; sur /10 le 10 doit rester RARE) :
**9-10** = exceptionnel ET **prouvé en RÉEL** (vrai marchand/prod), rare ; **7-8** = solide (prouvé
synthétique + revue OK) ; **5-6** = acceptable mais lacunes ; **≤4** = problème. **Ne JAMAIS mettre
10 par défaut** ; tant que ce n'est prouvé que sur données synthétiques, plafonner à **8**.
1. **Preuve** : 2 = « tests verts » seulement ; 8 = sortie RÉELLE inspectée champ par champ sur une
   entrée sale (méthode §1bis) ; 9-10 = idem prouvé sur vraie data marchand.
2. **Sécurité north-star** : 2 = risque de faux positif / perte silencieuse non vérifié ;
   8-10 = revue silent-failure-hunter SOUND, aucun faux positif/perte introduit.
3. **Réversibilité** : 1 = irréversible (migration appliquée…) ; 9-10 = `git revert` propre, 0 migration.
4. **Discipline de scope** : 2 = >20 fichiers ou hors-sujet ; 9-10 = 1 unité ciblée.
5. **Alignement north-star** : 2 = busywork ; 9-10 = avance directement la data exacte / le pilote.

**+ Métriques OBJECTIVES** (faits, pas auto-flatterie) :
- tests : total + delta (`X→Y`) ; **bugs réels** trouvés+corrigés ce run ; **fichiers touchés**.
- **Change-failure-rate roulant** : lire `logs/cost-ledger.txt`, sur les **10 derniers runs**
  calculer le % avec `exit=0` ET un commit (+ nb de reverts détectés dans le `git log`). C'est
  le chiffre non-gameable de fiabilité de la boucle.

**Sortie** : (a) bloc scorecard complet dans l'entrée `worklog-autonomie.md` du run ; (b) version
COMPACTE **en append dans `logs/notify-extra.txt`** (le wrapper l'envoie à Thomas sur WhatsApp +
Telegram puis le vide). Format compact :
`[NOTE <date>] Preuve x/10 | Secu x/10 | Rev x/10 | Scope x/10 | Align x/10 || tests A->B | N bug(s) reel(s) | F fichiers | CFR 10 runs: P% OK`

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
