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

## 🟢 Prospection (débloqué par le pivot vacances-des-2-boutiques du 07/07)

- [x] **A. Budget Outscraper** — FAIT le 2026-07-07. Clé fournie, run 9 catégories Google Maps + enrichissement email. **Résultat : 17 → 262 emails** (base `prospects-avec-email-2026-07-08.csv`), 478 prospects au total. **Coût réel : 0 $** (palier gratuit Outscraper, solde 20 $ intact). ~5 chaînes nationales à filtrer au besoin.
- [ ] **B. Domaine d'envoi secondaire** (ex. `go-twostep.fr`, ~10 €/an) + outil cold-email avec warmup (Instantly/Lemlist ~30-50 $/mois) pour envoyer en masse sans cramer contact@twostep.fr. Reco : OUI si tu passes à >40 mails/jour ; sinon envoi artisanal 30/jour d'abord.
- Détail : `reco-outils-emails-2026-07-07.md`. Email de tri prêt : `email-blast-decouverte-2026-07-07.md`.

## 🟠 Important (avant/pendant le pilote)

- [ ] **5. Flag `GOOGLE_GTIN_ONLY_TIER`** (D2) : activer au 1er pilote pour que Google enrichisse
  la tête de catalogue depuis le GTIN (trick NearSt). Reco : **ON au moment du 1er feed pilote**, pas avant.
- [ ] **6. Clés `GROQ`/`GEMINI`** : l'AI-categorize (autoritaire sur la catégorie) est inerte sans.
  Reco : OUI en même temps que la clé ANTHROPIC.
- [ ] **7. Séance de jugement visuel UI** (écrans E1-E5 + vitrine + preview feed) : supervisée,
  Thomas + Chrome DevTools MCP. La boucle ne peut pas trancher « pro vs moyen ».
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
