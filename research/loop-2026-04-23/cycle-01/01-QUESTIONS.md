# Cycle 01 — Génération des questions

*2026-04-23 ~01:15 CET. Basé sur les 8 angles morts A-H de 00-INGESTION.md.*

## 20 questions candidates

### a) Angles morts du Nexus (sujets effleurés)

**Q1** — Quelle est la conversion réelle LFP (Local Feed Partner) → clics consommateurs pour un commerce indépendant français en 2025-2026 ?
- Source : hypothèse H3 non testée ("LFP amène 5+ visites/mois")
- Hypothèse départ : plutôt 1-3 visites/mois/marchand, effet long terme
- Pourquoi ça compte : si <1, LFP n'est plus un canal mais un argument de pitch
- Précédemment traitée ? Non

**Q2** — Combien de minutes/mois/marchand un fondateur SaaS local doit-il investir pour éviter le churn à 20 marchands ?
- Source : angle mort E (unit economics vs temps Thomas)
- Hypothèse départ : 30 min/semaine/marchand → 10h/semaine à 20 marchands, plafond solo atteint
- Pourquoi ça compte : détermine quand recruter, pricing viable
- Précédemment traitée ? Non

**Q3** — Quels marchands indépendants ont quitté Cocote (FR, 4800 marchands, 20% actifs) et quelles raisons ont-ils donné ?
- Source : brain Concurrents-echecs
- Hypothèse départ : manque ROI visible + commission pas motivante
- Pourquoi ça compte : valide ou invalide différenciateurs Two-Step
- Précédemment traitée ? Non (fiche Cocote existe mais côté business, pas côté exit reasons)

**Q4** — Place des Libraires : ratio 15 conso/1 marchand — d'où vient ce chiffre, extrapolable hors librairie ?
- Source : hypothèse H8 + modèle de référence
- Hypothèse départ : ratio gonflé par la communauté livre (fidélité particulière), pas extrapolable directement
- Pourquoi ça compte : si invalide, cold start sous-dimensionné
- Précédemment traitée ? Non (fiche Place-des-Libraires existe mais chiffres non sourcés profondément)

**Q5** — Le pitch "verrouillé à vie 19€" fonctionne-t-il mieux sur boutiquiers >50 ans ou <40 ans ?
- Source : pricing tiers non segmenté par profil
- Hypothèse départ : >50 préfère stabilité (apprécie verrouillage), <40 veut flexibilité (freemium)
- Pourquoi ça compte : segmente le pitch, priorise les leads
- Précédemment traitée ? Non

### b) Contradictions Nexus ↔ code

**Q6** — Brain dit "0 marchand payant" — DB dit 7 pending. Quelle conversion pending → paid attendue (benchmark SaaS B2B FR) ?
- Source : écart brain (metric 0) vs reality (7 pending)
- Hypothèse départ : 15-25% en SaaS B2B low-touch, peut-être < pour petits commerçants
- Pourquoi ça compte : permet de prédire combien de signups il faut pour 5 payants Trusted
- Précédemment traitée ? Non

**Q7** — `/api/catalog/import/route.ts` existe — a-t-il été testé avec 10 CSV réels terrain (H7) ?
- Source : écart H7 "pipeline parse 90%" vs réalité tests
- Hypothèse départ : pas testé, 50% échec sur colonnes non-standard
- Pourquoi ça compte : bloque onboarding premier marchand non-POS
- Précédemment traitée ? Non (grep à faire, pas fait dans ingestion)

**Q8** — Le code writeback POS désactivé via flag : quel est le coût réel de maintenance du dark code ?
- Source : 600 lignes hors scope actives dans le bundle
- Hypothèse départ : faible (bundle +5KB, tests non critiques), mais risque cognitive drift
- Pourquoi ça compte : décision "supprimer vs garder gated"
- Précédemment traitée ? Non

### c) Dépendances implicites jamais vérifiées

**Q9** — Rate limits Groq gratuit sur AI verify sous charge enrichissement réelle (50+ produits/min) ?
- Source : AI verify cascade documentée sans quota analysis
- Hypothèse départ : Groq free = 30 req/min, hit rapide sous bootstrap
- Pourquoi ça compte : dégradation silencieuse possible en prod
- Précédemment traitée ? Non

**Q10** — Infomaniak `+` aliases : confirmé bloquants pour @twostep.fr. Quels workarounds (catch-all déjà actif) pour tester signup en dev sans Gmail ?
- Source : découverte session ce soir
- Hypothèse départ : Cloudflare Email Routing catch-all peut filtrer par destinataire
- Pourquoi ça compte : préserve test E2E signup en dev
- Précédemment traitée ? Non

**Q11** — Supabase "Site URL" configurable par environnement ? Ou contrainte à 1 valeur globale ?
- Source : constat redirect prod vs local ce soir
- Hypothèse départ : contrainte 1 URL, workaround = `additionalRedirectURLs`
- Pourquoi ça compte : dev UX friction
- Précédemment traitée ? Non

**Q12** — Stripe test → live : quel est le switch opérationnel exact pour passer prod (clés env, plans, webhooks) ?
- Source : billing actuellement en test mode, 0 marchand
- Hypothèse départ : rotation clé + refresh Stripe products + re-config webhooks
- Pourquoi ça compte : décision "quand on switch", éviter bug au 1er paiement
- Précédemment traitée ? Non (fiche Stripe existe mais côté architecture, pas côté ops switch)

**Q13** — `/api/cron/google-feed` : câblé dans `vercel.json` comme cron ? À quelle fréquence ? Sinon c'est du code mort.
- Source : gitnexus trouve la route mais pas la config cron
- Hypothèse départ : câblé à 03:00 UTC, à vérifier
- Pourquoi ça compte : si pas câblé, feed jamais pushé à Google
- Précédemment traitée ? Non (grep vercel.json à faire)

### d) Terrain / go-to-market

**Q14** — Top 10 objections de commerçants indépendants français face à un SaaS local marketplace en 2026 ?
- Source : kit-prospection a 10 objections mais source non tracée
- Hypothèse départ : #1 "j'ai pas le temps", #2 "je comprends pas le ROI", #3 "Google/Facebook suffit"
- Pourquoi ça compte : scripts vente à aligner
- Précédemment traitée ? Non (kit existe, pas sourcé vs interviews réelles)

**Q15** — RDV/semaine max tenables par un solo founder pour signer 5 marchands en 6 semaines à Toulouse ?
- Source : planification terrain non-calibrée
- Hypothèse départ : 15-20 RDV/semaine, taux signature 20%, donc 3-4 signatures/semaine théoriques
- Pourquoi ça compte : détermine planning Thomas en Phase 1
- Précédemment traitée ? Non

**Q16** — Saisonnalité commerce Saint-Étienne Toulouse : été (tourisme), Noël (pics), soldes ? Fenêtre optimale pour approcher ?
- Source : cold start non-segmenté par timing
- Hypothèse départ : pics d'activité = mauvais (ils sont débordés), creux après-soldes (jan/fév) = meilleur onboarding
- Pourquoi ça compte : timing de la Phase 1
- Précédemment traitée ? Non

**Q17** — Associations commerçants Toulouse (ACAAB, ACRR, Colombette) : offrent-elles canaux d'intro vérifiés / warm leads ?
- Source : brain mentionne les associations mais pas explicitement canaux d'intro
- Hypothèse départ : oui si on leur fait signer un premier membre, non si cold
- Pourquoi ça compte : X2-X5 sur vélocité prospection
- Précédemment traitée ? Non

**Q18** — Comment jouer le "premier marchand showcase" pour convertir les suivants (Dear Skin Shop comme pilote public) ?
- Source : cold start mentionne showcase mais pas playbook
- Hypothèse départ : vidéo before/after du dashboard, PR Actu Toulouse, co-signature d'une publication
- Pourquoi ça compte : effet boule de neige début Phase 1
- Précédemment traitée ? Non

### e) Positionnement / visibilité

**Q19** — En 2026, un feed LFP apparaît-il AVANT un feed Shopping classique pour un consommateur FR qui cherche "Nike Air Force 1 Toulouse" ? Prévalence réelle ?
- Source : hypothèse implicite dans cold start (LFP = killer feature visibilité)
- Hypothèse départ : oui si marchand ≤ 5km ET stock dispo ET Google Trusted → bloc "produits à proximité" en haut
- Pourquoi ça compte : valide la thèse "LFP > Shopping pour local"
- Précédemment traitée ? Non (fiche LFP explique le produit, pas la prévalence d'affichage)

**Q20** — En 2026, les consommateurs FR cherchent-ils vraiment "stock local" sur Google, ou ont-ils migré vers TikTok Shop / Insta Shopping / bouche-à-oreille pour la découverte ?
- Source : angle mort D — valeur networked assumée
- Hypothèse départ : Google encore dominant pour intent commercial précis (Nike AF1, prix connu), mais découverte glissée vers TikTok/Insta (tendances, inspiration)
- Pourquoi ça compte : détermine si Two-Step doit cibler l'intent search (Google) ou la découverte (social) comme canal conso
- Précédemment traitée ? Non

---

## Pondération

| Q | Impact GTM (40%) | Non-traitée (25%) | Testabilité (20%) | Angle mort (15%) | Score |
|---|---|---|---|---|---|
| Q1 | 9 | 9 | 7 | 8 | **8.35** |
| Q2 | 10 | 10 | 6 | 10 | **9.20** |
| Q3 | 7 | 8 | 7 | 7 | **7.25** |
| Q4 | 7 | 9 | 8 | 9 | **7.90** |
| Q5 | 6 | 9 | 5 | 8 | **6.85** |
| Q6 | 8 | 8 | 9 | 6 | **7.90** |
| Q7 | 7 | 10 | 10 | 7 | **8.35** |
| Q8 | 4 | 8 | 8 | 6 | **6.10** |
| Q9 | 5 | 10 | 10 | 7 | **7.55** |
| Q10 | 3 | 10 | 8 | 5 | **5.55** |
| Q11 | 3 | 10 | 7 | 4 | **5.70** |
| Q12 | 7 | 9 | 9 | 5 | **7.60** |
| Q13 | 8 | 9 | 10 | 6 | **8.15** |
| Q14 | 10 | 8 | 7 | 7 | **8.45** |
| Q15 | 10 | 9 | 7 | 8 | **8.85** |
| Q16 | 7 | 10 | 7 | 8 | **7.90** |
| Q17 | 9 | 9 | 7 | 7 | **8.10** |
| Q18 | 9 | 9 | 6 | 8 | **8.10** |
| Q19 | 10 | 9 | 8 | 8 | **9.05** |
| Q20 | 10 | 10 | 6 | 10 | **9.20** |

## 5 questions retenues pour recherche profonde

### Top 5 par score pondéré

1. **Q2** (9.20) — Minutes/mois/marchand soutenable solo à 20 marchands ?
2. **Q20** (9.20) — Consos FR cherchent-ils stock local sur Google ou migrent vers TikTok/Insta ?
3. **Q19** (9.05) — Feed LFP vs Shopping classique : prévalence d'affichage FR 2026 ?
4. **Q15** (8.85) — RDV/semaine soutenables solo founder Toulouse pour 5 signés en 6 semaines ?
5. **Q14** (8.45) — Top objections commerçants indépendants FR face à SaaS marketplace local 2026 ?

### Justification de la sélection

Ces 5 couvrent les 3 dimensions **go/no-go Two-Step** :
- **Produit/marché** (Q20 découverte moderne, Q19 visibilité Google) → valident ou invalident que la thèse "stock local sur Google" répond à un comportement conso actuel
- **Opérationnel fondateur** (Q2 temps/marchand, Q15 vélocité prospection) → déterminent la faisabilité solo en Phase 1
- **Conversion terrain** (Q14 objections) → arme directement les scripts de vente

**Ce qu'elles excluent (pour cycle 2)** : Q1 (LFP clicks), Q3 (Cocote churn), Q4 (ratio 15:1), Q7 (CSV parsing) — tous pertinents mais dérivés ou techniques.

**Risque méta** : sélection très business/marché, peu tech. Si cycle 2 devient aussi business, on aura négligé les angles techniques (rate limits, feed, switch Stripe). À rééquilibrer.
