# Runbook — Onboarding du marchand PILOTE (Deerskin), de la poignée de main au feed quotidien vert

> **P1 6a.3 de la mission Opération Pilote** (`autonomy-priorities.md` §1ter). Mode d'emploi
> OPÉRATIONNEL pas-à-pas pour Thomas : chaque étape avec l'écran ou la commande EXACTE.
> **Testé à blanc de bout en bout le 2026-07-08** sur un marchand jetable via le VRAI pipeline
> (preuve en fin de document). Complète (ne remplace pas) `go-live-checklist.md` (readiness) et
> `dear-skin-bootstrap.md` (premier contact).
>
> Pilote #1 : **Deerskin** (POS **Zettle** → export CSV possible + OAuth possible).
> Cible : catalogue ingéré → ≥ 11 offres publiables → Google connecté → feed vert à 03:00 UTC.

---

## Vue d'ensemble (7 phases)

| # | Phase | Qui | Durée estimée |
|---|---|---|---|
| 0 | Prérequis env prod (UNE fois, avant tout onboarding réel) | Thomas | 30 min |
| 1 | RDV : ce qu'on récupère du marchand | Thomas + marchand | 15 min |
| 2 | Compte + boutique | marchand (assisté) | 10 min |
| 3 | Import du stock (4 voies, choisir 1) | Thomas ou marchand | 10-30 min |
| 4 | Enrichissement + review (OBLIGATOIRE) | Thomas (pilote) | 30 min - 2 h |
| 5 | Connexion Google + readiness | marchand (assisté) | 10 min |
| 6 | Feed quotidien vert (J+1) | automatique + vérif | 5 min |
| 7 | Actions externes Google | marchand (guidé) | variable |

---

## Phase 0 — Prérequis env prod (UNE SEULE FOIS, avant le 1er onboarding réel)

Sans ces GO (tous dans `docs/DECISIONS-EN-ATTENTE.md`), l'onboarding « marche » mais dégradé :

| Décision | Si absente, conséquence CONCRÈTE au pilote |
|---|---|
| **#2 `INSEE_API_TOKEN`** | `verifySIRET` fail-open : tout SIRET à 14 chiffres passe (pas bloquant pour Deerskin qu'on connaît, rédhibitoire pour du self-serve) |
| **#1 `ANTHROPIC_API_KEY`** | vérif photo fail-CLOSED → **AUCUNE photo auto-publiée** ; l'enrichissement image est gelé (110 image_jobs en attente depuis avril) |
| **#6 `GROQ`/`GEMINI`** | AI-categorize inerte → catégorie = fallback EAN seulement (souvent null) → à corriger à la main dans la review |
| **#3 migrations 106-111** | notamment **108** : sans elle, l'adresse email-in n'est PAS créée pour un marchand neuf → **voie D morte en self-serve** (backfill/trigger prêts, non appliqués) |
| **#5 `GOOGLE_GTIN_ONLY_TIER`** | OFF = un produit sans photo n'entre pas au feed ; ON = Google enrichit depuis le GTIN (trick NearSt). Reco : ON au 1er feed pilote |

Vérif rapide des env : `vercel env ls` (ou dashboard Vercel → Settings → Environment Variables).

## Phase 1 — Le RDV (repris de `dear-skin-bootstrap.md`)

À récupérer séance tenante (tout le reste peut se faire sans le marchand) :
- [ ] **Export CSV du catalogue Zettle** (dashboard Zettle Pro → « Exporter » → `.csv`)
- [ ] **Adresse exacte de la boutique** (⇒ `store_code` Google LFP) + horaires
- [ ] **Email de contact** (compte + Stripe plus tard)
- [ ] État Google : a-t-il un **Business Profile vérifié** ? un Merchant Center ? (phase 7)
- [ ] 5-10 factures fournisseur PDF récentes (voie stock secondaire + redispo)

## Phase 2 — Compte + boutique (10 min, avec le marchand)

1. **Écran `https://twostep.fr/auth/signup`** : le marchand crée son compte (son email).
2. **Écran `/onboarding`** (wizard) : nom boutique, adresse (EXACTE = celle du Business Profile,
   sinon le `store_code` LFP divergera), catégorie, horaires.
3. Vérif : `/dashboard` s'affiche avec la checklist d'onboarding (bannière email-in incluse
   si migration 108 appliquée).

> Alternative « Thomas fait tout » : créer le compte avec l'email du marchand + transmettre le
> mot de passe provisoire (reset ensuite). L'écran **`/admin/onboarding-wizard`** (compte admin)
> enchaîne ensuite : Import CSV → queue review → enrichissement manuel → publier feed, piloté
> par `merchant_id`.

## Phase 3 — Importer le stock (choisir UNE voie d'entrée)

> Peu importe la voie : tout converge vers le MÊME pipeline (`ingestStockSnapshot` : triage →
> identité EAN/SKU → create/update → réconciliation). Un push = un SNAPSHOT (remplace), pas un delta.

### Voie A (recommandée jour 1 — Deerskin) : import CSV self-serve
1. **Écran `/dashboard/stock/mon-stock`** → bouton **Importer** → sélectionner le CSV Zettle.
2. L'app fait d'abord une **preview** (simulation sans écriture, `import-wizard`) : lignes
   acceptées / rejetées + causes → **lire la preview avant de confirmer**.
3. Confirmer → import réel (`POST /api/catalog/import`).
4. **Vérifier le rapport** : `column_coverage` doit être `quantity:true, identifier:true,
   price:true`. Un `quantity:false` = colonne quantité non reconnue → toutes les qtés à 1 →
   STOP, adapter les en-têtes (le parseur connaît les en-têtes FR : quantité/qté, code-barres/
   gencode, prix/PU HT…).

### Voie B : connexion caisse Zettle (OAuth, temps réel)
1. **Écran `/dashboard/stock/pos`** → carte **Zettle** → « Connecter » → OAuth Zettle.
2. Sync initiale automatique, puis **webhooks temps réel** + resync toutes les 6 h
   (cron `pos-resync`). Scopes = LECTURE seule (contrat read-only prouvé D6).
3. Vérif : `/dashboard/stock/pos` affiche « connecté » + nombre de produits.

### Voie C (opérée par Thomas, sans UI) : push API à jeton
- Jeton : `getOrCreateIngestToken(merchantId)` (pas d'écran marchand — script/SQL admin).
- Push : `POST https://twostep.fr/api/ingest/stock?filename=stock.csv` avec
  `Authorization: Bearer <jeton>` et le CSV en corps. **C'est la voie testée à blanc** (preuve infra).
- Sert aussi de plan B si l'export Zettle a un format exotique : on convertit nous-mêmes puis on pousse.

### Voie D : email-in (le wedge sans-caisse) — ⚠️ GATED
- Le marchand envoie son CSV en pièce jointe à son **adresse d'import dédiée** (affichée sur
  `/dashboard/stock/factures` + bannière dashboard).
- ⚠️ **Ne fonctionne pour un marchand NEUF qu'après la migration 108** (décision #3) : sans elle,
  `inbound_email_slug` est NULL → l'email est ignoré.

## Phase 4 — Enrichissement + review (OBLIGATOIRE — ne JAMAIS sauter)

1. Les produits importés arrivent **invisibles** (`review_status: pending`) — c'est voulu :
   rien ne se publie sans validation.
2. L'enrichissement tourne tout seul : cron `enrich-products` **toutes les 5 min** en prod
   (EAN → nom canonique/marque/catégorie/photo, cascade multi-sources + garde de concordance D7).
3. **Écran `/dashboard/stock/review`** : valider/rejeter fiche par fiche (ou en lot).
   - **Pourquoi c'est non négociable — preuve du test à blanc 2026-07-08** : l'EAN
     `3017620422003` (« Nutella 750g ») a été résolu par une source polluée en « EAU DU
     BOUHEUR eau de toilette… FRAGONARD » avec un score brut de **0.965**. La garde de
     concordance (D7) l'a rétrogradé `pending`/invisible → **le système ne publie pas un
     mensonge, mais c'est l'œil humain de la review qui tranche l'identité finale.**
   - Sans clé ANTHROPIC (décision #1) : pas de photo auto → compléter photo à la main ou
     activer le tier GTIN-only (décision #5) pour que Google enrichisse.
4. Objectif chiffré : **≥ 11 offres publiables** (GTIN ≥ 8 + prix > 0 + photo*) —
   suivre `blocked_only_by_image` / `missing_ean` / `missing_price` sur l'écran Google (phase 5).

## Phase 5 — Connexion Google + readiness

1. **Écran `/dashboard/google`** → « Connecter à Google » (OAuth compte Google du marchand,
   celui du Merchant Center).
2. Le même écran affiche la **readiness LFP** : carte « Prêt pour Google LFP » (vert) ou
   « Bientôt prêt » + freins ordonnés (`lfp_offer_shortfall` offres manquantes, connexion).
   Source : `GET /api/google/stats` → champ unique **`lfp_feed_ready`**.
3. **Écran `/dashboard/google/preview`** (mode SHADOW, lecture seule) : montre le payload
   EXACT qui serait publié + par-produit les causes de blocage → **montrer cet écran au
   marchand AVANT le 1er push** (« voilà ce que Google verra »).

## Phase 6 — Feed quotidien vert (J+1)

1. **Rien à faire** : cron `google-feed` à **03:00 UTC** pousse la Voie A (Content API)
   pour chaque marchand connecté ; la Voie B (XML crawlé) est servie en continu sur
   `GET /api/feed/lfp/<merchantId>`.
2. Vérif le matin : `/dashboard/google` → statut du dernier push (`last_feed_status`) doit
   être `success` (« partial »/« error » = voir Dépannage).
3. Cron `google-status` à **06:00 UTC** relit les statuts produits côté Google et remonte
   les rejets (`quality_alerts google_disapproved` si flag actif, sinon Sentry).
4. Temps réel ensuite : chaque vente Zettle (webhook) met le stock à jour + push inventaire.

## Phase 7 — Actions externes Google (côté marchand, guidées par Thomas)

Voir `go-live-checklist.md` §3 (la boucle ne les voit pas) :
- [ ] Business Profile **vérifié** ; [ ] BP **lié** au Merchant Center (store_code aligné) ;
- [ ] clic **« Request inventory verification »** dans Google MC ;
- [ ] Répéter ×5 marchands vérifiés = statut **Trusted**.

---

## Dépannage (symptôme → cause → action)

| Symptôme | Cause probable | Action |
|---|---|---|
| Rapport d'import `status:"partial"` + `column_coverage.quantity:false` | colonne quantité non reconnue → qtés forcées à 1 | corriger l'en-tête CSV, re-pousser (snapshot = idempotent) |
| Lignes rejetées `no_identifier` | produit sans EAN ni SKU | normal (rejet listé + motivé) ; ajouter un code ou créer à la main |
| Push API → 401 | jeton invalide/révoqué | régénérer (`rotateIngestToken`) |
| Produit importé mais invisible en vitrine | `review_status: pending` (voulu) ou stock 0 | passer par `/dashboard/stock/review` |
| Fiche enrichie avec un nom absurde | source EAN polluée (cas Nutella→Fragonard ci-dessus) | rejeter dans la review → la fiche garde le nom marchand |
| « Bientôt prêt » sur `/dashboard/google` | < 11 offres publiables ou pas connecté | suivre les freins affichés (photo/EAN/prix manquants) |
| `last_feed_status: "partial"` | budget temps (catalogue énorme) — statut honnête, jamais un faux success | re-run suivant reprend ; si chronique → chunking (item A3) |
| `last_feed_status: "error"` | connexion Google expirée / API | reconnecter sur `/dashboard/google` |
| Re-push du même fichier → `status:"unchanged"` | idempotence (voulu) | rien à faire |
| (dev local) push → `ingest token resolution failed: fetch failed` | NetLimiter TLS : le serveur dev n'hérite pas du contournement | relancer `npm run dev` depuis un shell avec `NODE_TLS_REJECT_UNAUTHORIZED=0` (dev SEULEMENT) |

---

## Preuve du test à blanc (2026-07-08, run autonome)

Harnais : `scripts/e2e-ingest-preview.mjs http://localhost:3000` (serveur dev local = code de la
branche, DB partagée, marchand JETABLE créé puis supprimé). Résultat : **TOUT VERT (17/17)** —
création marchand + jeton, push CSV FR sale (EAN + SKU + rejet motivé), triage 1 GTIN / 3 SKU /
1 rejet `no_identifier`, 3 produits créés, tailles `42/43` tracées `file_column`, stock
`source=file_push`, 3 jobs d'enrichissement → worker `processed:3, done:3, failed:0`, produit
invisible avant review, **re-push identique → `unchanged`**, jeton invalide → 401, nettoyage OK.

Vérif complémentaire (D7 sur le chemin réel) : EAN connu résolu FAUX par une source polluée
(score brut 0.965) → `review_status: "pending"`, `visible: false`, photo null. **Rien ne
s'auto-publie sur une identité douteuse.**

**Limites honnêtes du test à blanc** (= reste à faire) :
1. CSV = fixture FR sale, PAS un vrai export Zettle → **P1 item 3** (fixtures réelles
   Clictill/Fastmag/Zettle à prouver champ par champ).
2. Local (branche), pas la prod déployée : la prod actuelle a ~85 commits de retard
   (merge = décision Thomas).
3. Les ÉCRANS sont cités mais leur rendu n'est pas jugé (la boucle n'a pas d'yeux) →
   séance visuelle = décision #7.
4. Voie B (OAuth Zettle réel), voie D (email-in, gated 108) et la connexion Google OAuth
   n'étaient pas exerçables à blanc (comptes externes requis).
