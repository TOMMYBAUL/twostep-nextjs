# DÉCISIONS EN ATTENTE — source unique (créé 2026-07-07, audit stratégique)

> **Thomas** : coche `[x]` + écris ta décision sur la ligne. La boucle lit ce fichier à CHAQUE run
> et exécute en priorité ce qui est tranché. Chaque non-décision a un coût, il est indiqué.
> **Boucle** : toute nouvelle escalade s'ajoute ICI (+ 1 ligne notify). Re-escalade groupée si > 7 jours.

## 🔴 Bloquant pilote (à trancher cette semaine)

- [ ] **1. Clé `ANTHROPIC_API_KEY` en prod** (décision D5, escaladée depuis le 23/06).
  Reco : **OUI, option A** (~0,001 $/image). Coût du retard : **110 image_jobs gelés depuis avril**,
  vérif photo OFF → aucune image publiable de façon sûre ; le fail-closed actuel = zéro image du tout.
- [ ] **2. Clé `INSEE_API_TOKEN` en prod**. Reco : **OUI avant tout onboarding réel** —
  aujourd'hui `verifySIRET` est fail-open assumé (tout SIRET à 14 chiffres passe en pending).
- [ ] **3. GO groupé migrations préparées non appliquées : 106, 107, 108, 110, 111**
  (alertes google_disapproved ; orphelins invisibles ; delta `source_ts` ; curseur feed).
  Toutes idempotentes, testées, réversibles, préparées par la boucle. Reco : **GO groupé en une
  fenêtre** (protocole §4 AUTONOMY, ~15 min supervisées). Coût du retard : les protections
  correspondantes restent OFF en prod.
- [ ] **4. RDV pilote Deerskin** (+ 2e boutique multimarque neuf, centre Toulouse).
  **La seule action que ni la boucle ni personne d'autre ne peut faire.** Tout le reste du
  système est construit et attend ce catalogue. Proposition : bloquer une demi-journée cette
  semaine ; la boucle aura le runbook + la vitrine démo prêts (P1 de la mission).
  → **Runbook PRÊT (2026-07-08)** : `docs/prospection/runbook-onboarding-pilote.md`, testé à
  blanc 17/17 vert via le vrai pipeline. → **Vitrine démo PRÊTE (2026-07-09)** : « Maison
  Garonne », 19 produits réels enrichis+photos via le VRAI pipeline —
  `docs/prospection/vitrine-demo-2026-07-09.md` (rendu à juger, décision #7).
- [ ] **14. Fail-open images du cron PROD (découvert+prouvé 2026-07-09)** : le cron
  `enrich-products` de la prod Vercel (code `main`, AVANT le fix fail-closed du 27/06)
  tourne toutes les 5 min sur la DB PARTAGÉE et a publié une image Google Images NON
  vérifiée pendant le run démo (preuve : `vitrine-demo-2026-07-09.md` §finale). Tout
  produit sans EAN poussé dans cette DB peut recevoir une FAUSSE photo en ≤ 5 min (la
  classe « 6/7 photos fausses »). **Décision (une des trois, la boucle ne peut faire
  aucune seule)** : **A.** poser `ANTHROPIC_API_KEY` en prod (= décision #1 ; réactive la
  vérif vision même sur le code main → ferme le trou ET dégèle les images) — **RECO** ;
  **B.** hotfix main : retirer le cron `enrich-products` de vercel.json prod en attendant
  le merge ; **C.** accélérer le re-merge branche→main (⚠️ divergence mesurée ce jour :
  114 commits main-only / 117 branche-only — ça grossit chaque jour).

## 🟢 Prospection (débloqué par le pivot vacances-des-2-boutiques du 07/07)

- [x] **A. Budget Outscraper** — FAIT le 2026-07-07. Clé fournie, run 9 catégories Google Maps + enrichissement email. **Résultat : 17 → 262 emails** (base `prospects-avec-email-2026-07-08.csv`), 478 prospects au total. **Coût réel : 0 $** (palier gratuit Outscraper, solde 20 $ intact). ~5 chaînes nationales à filtrer au besoin.
- [x] **B. Domaine d'envoi** — TRANCHÉ le 2026-07-08 : **PAS de nouveau domaine** (choix Thomas). Solution retenue : envoi depuis `contact@twostep.fr` (via SMTP Infomaniak, déjà autorisé par le SPF/DMARC du domaine) ou Gmail, avec **Mailmeteor** en mail-merge, **35 mails/jour** personnalisés + opt-out. Plan complet : `plan-envoi-adresse-actuelle-2026-07-08.md`, liste prête : `mailmerge-toulouse-2026-07-08.csv` (254 contacts, chaînes retirées).
- Détail : `reco-outils-emails-2026-07-07.md`. Email de tri prêt : `email-blast-decouverte-2026-07-07.md`.

## 🟠 Important (avant/pendant le pilote)

- [ ] **5. Flag `GOOGLE_GTIN_ONLY_TIER`** (D2) : activer au 1er pilote pour que Google enrichisse
  la tête de catalogue depuis le GTIN (trick NearSt). Reco : **ON au moment du 1er feed pilote**, pas avant.
- [ ] **6. Clés `GROQ`/`GEMINI`** : l'AI-categorize (autoritaire sur la catégorie) est inerte sans.
  Reco : OUI en même temps que la clé ANTHROPIC.
- [ ] **7. Séance de jugement visuel UI** (écrans E1-E5 + vitrine + preview feed) : supervisée,
  Thomas + Chrome DevTools MCP. La boucle ne peut pas trancher « pro vs moyen ».
- [ ] **11. Flag `CONSUMER_M5_CONFIDENCE=1`** (P0-4, préparé le 2026-07-08, commit `bcdb1db`) :
  les surfaces conso (discover/recherche/favoris/boutique) affichent la confiance M5 honnête
  (Disponible / Stock probable / Épuisé + fraîcheur) au lieu de « Stock vérifié » sur le seul
  compteur brut. OFF = comportement actuel inchangé. Reco : **poser le flag en preview et juger
  le rendu pendant la séance #7** (l'app conso est gatée /bientot pendant la phase pilote →
  exposition minimale). Coût du retard : les 3 vérités contradictoires restent visibles à
  quiconque voit une démo de l'app conso.
- [ ] **12. Flag `VERIFY_OPEN_FACTS_IMAGES=1`** (audit M3 HAUT, préparé le 2026-07-09, commit `0f6695c`) :
  soumettre les images Open Facts (OBF/OPF) à la vérif vision Haiku avant publication, comme Serper.
  Aujourd'hui elles passent SANS contrôle (décision 06-28 « GTIN-keyée = fiable » — l'audit conteste :
  barcode reuse, photo de dos). OFF = comportement actuel inchangé. Reco : **ON en même temps que la
  clé ANTHROPIC (décision 1)** — l'activer SANS la clé = zéro photo du tout (fail-closed). Limites
  honnêtes : une photo rejetée n'est PAS re-tentée automatiquement (tracée Sentry par produit ;
  marqueur+retry = design à trancher si besoin) ; `PUBLISH_UNVERIFIED_IMAGES=1` annule la vérif ;
  le wizard admin (cascade-suggest) reste hors garde (revue humaine). **NB coût (09/07,
  revue SF-hunter)** : avec le flag ON, une photo OBF rejetée par la vision peut re-déclencher
  le repli Serper une 2e fois dans le même run (chemin « photo convergée ») — jusqu'à 2
  recherches Serper/produit ; à accepter explicitement ou à mitiger au GO.
- [ ] **13. GO migration 112 + flag `FILE_PUSH_ATOMIC_STOCK=1`** (audit M4 CRITIQUE item #3,
  préparé le 2026-07-09, commit `c7b56ef`) : le REPLACE stock du file_push passe par la RPC batch
  `ingest_stock_batch` = même garde temporelle que les webhooks (un export périmé n'écrase plus
  une vente webhook plus fraîche), en 1 appel par lot de 500. **Déjà actif sans GO** : vrai
  `source_ts` (heure de génération de l'export) sur les 3 canaux + réconciliation gardée (un
  produit restocké par webhook n'est plus zéroé par un export antérieur). **Reste gaté** : le
  REPLACE (produit PRÉSENT dans le fichier) reste écrasant tant que 112+flag ne sont pas actifs
  — M4 n'est clos qu'à moitié. Ordre STRICT : appliquer 112 (protocole §4, groupable avec la
  décision #3) PUIS poser le flag (flag sans migration = repli upsert signalé Sentry, sans perte).
  Reco : **GO groupé avec #3** (même fenêtre supervisée ~15 min).
- [ ] **15. GO migration 113 + flag `MERCHANT_SLA_HISTORY=1`** (G1, préparé le 2026-07-10) :
  historique QUOTIDIEN du SLA qualité par marchand (table `merchant_sla_history`, écrite par le
  cron quality-check 05:00, lue par l'écran Google du dashboard — l'argument commercial NearSt
  « X % de ton stock est publiable et frais + courbe 7 j » qu'on montre à Deerskin). **Déjà actif
  sans GO** : la tuile « Fraîcheur du stock » temps réel sur `/dashboard/google` (champs additifs
  de `/api/google/stats`, aucun flag requis). **Reste gaté** : la persistance de l'historique.
  Ordre STRICT : appliquer 113 (protocole §4) PUIS poser le flag (flag sans migration = écriture
  échoue proprement, capturée Sentry + statut degraded, alertes intactes). 2 revues SOUND
  (SF-hunter + database-reviewer). Reco : **GO groupé avec #3** (même fenêtre supervisée).
- [ ] **16. GO migration 114 + flag `GOOGLE_FEED_RUNS_HISTORY=1`** (G2, préparé le 2026-07-11) :
  historique de QUALITÉ du feed Google par marchand (table `google_feed_runs`, écrite par le cron
  `google-status` 06:00 — served/pending/refusées + top-10 causes par jour, lue par l'écran Google
  du dashboard = le feed-quality report type NearSt qu'on montre au pilote avec la courbe SLA G1).
  Le cron calculait déjà tout et le JETAIT dans sa réponse HTTP. **Sans GO, rien ne change** (flag
  OFF = prod byte-identique, testé). Ordre STRICT : appliquer 114 (protocole §4) PUIS poser le flag
  (flag sans migration = écriture échoue proprement, capturée Sentry, signal de rejet intact).
  2 revues SOUND (SF-hunter + database-reviewer ; 2 CHECK trip-wire ajoutés sur reco). Reco :
  **GO groupé avec #3/#13/#15** (même fenêtre supervisée ~15 min). NB : ne devient VIVANT qu'avec
  ≥1 marchand connecté Google (aujourd'hui 0) — à activer en même temps que le reste, coût nul.
- [ ] **8. Cadence de la boucle** : tâche planifiée = 1 run/75 min × 15 h ≈ **12 runs/jour**.
  Avec la mission Opération Pilote il y a à nouveau du travail réel, mais la reco reste
  **4-6 runs/jour** (runs profonds > runs fréquents ; quota partagé avec ton usage perso).

## 🟡 Stratégique (pas urgent, mais à trancher une fois)

- [ ] **9. Arbitrage M10 — plateforme partenaires / couche transactionnelle** (réservations,
  Local Checkout, API partenaires façon developers.near.st). Reco : **NON pour l'instant**
  (hors-wedge tant que 0 pilote ; à revisiter au statut Trusted / 5 marchands).
- [ ] **10. Modèle LFP** : relancer la candidature « data provider » (A) vs continuer par-marchand
  via OAuth Content API qu'on a déjà (B). Reco : **B d'abord** (rien à attendre de Google), A en parallèle
  quand 1 pilote live donne du poids au dossier (contact : gTech, tickets 5-9519000040422 / 6-7242000040976).

## ✅ Tranchées (historique)

- (2026-06-22) Merge feat → main + déploiement twostep.fr : FAIT.
- (2026-06-27) Vérif photo fail-CLOSED par défaut : appliqué en code (conséquence : décision 1 ci-dessus).
