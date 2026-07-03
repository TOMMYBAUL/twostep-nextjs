# ROADMAP — « Devenir NearSt en France » (trame directrice)

> Créé le 2026-07-01 (Thomas + Opus), à partir de 2 teardowns sourcés de near.st
> (produit + technique) confrontés à notre `docs/SPEC/` (M1→M9). **Objet : la route
> pour atteindre le niveau NearSt, découpée en chantiers → sous-parties → tâches, avec
> un propriétaire par tâche.** Fable 5 exécute la partie code ; Thomas la partie humaine.

## Le wedge (ne pas le perdre de vue)

NearSt = ~10 ans, £2M levés, **Trusted Google Local Feeds Partner**, 800k PdV, 130+
intégrations. **On ne matchera pas leur largeur vite, et on ne doit pas essayer.**
« Atteindre leur niveau » = **copier leur STRUCTURE + les battre sur notre coin** :
1. **La France** — ils sont *absents*.
2. **La qualité data honnête** — on est déjà *plus profond* que ce qu'ils publient.
3. **Ne pas refuser les caisses FR fermées** — eux les refusent (cf. PROJECT-BRIEF).

Barre haute sur la **vision**, pas sur « 130 connecteurs pour 0 marchand » (= la dérive
que la boucle a déjà attrapée).

## Les 6 chantiers (matrice d'écart)

| # | Chantier | NearSt a | Nous | Copie / Adapte FR |
|---|----------|----------|------|-------------------|
| 1 | **Ingestion — largeur & France** *(leur moat)* | 130+ systèmes, clé/magasin, cron full-file, one-click, e-com+ERP | 4 POS intégrés + Clictill/Fastmag réels **non testés** + push fichier ; 0 prouvé réel | Modèle clé/magasin ; **Clictill/Fastmag/EBP + email-in** (caisses fermées) |
| 2 | **Distribution multi-canal** | Google SWIS+LIA, **Meta**, Uber Eats/Just Eat/Deliveroo, Product Locator, Ship-from-Store | **Google LFP seul** (Voie A+B) | Meta Catalog, widget locator, API `locate/{barcode}` ; last-mile plus tard |
| 3 | **Qualité data & fiabilité PROUVÉE** *(notre force)* | Enrichissement IA GTIN→photo/desc, **≤15 min affichée**, normalisation identifiants, Trusted partner | Cascade M3 + confiance M5 + réconciliation M4 (souvent plus profond) ; e2e photo non prouvé, **0 marchand réel** | **SLA fraîcheur affiché**, ISBN-10→13 ; devenir Trusted partner |
| 4 | **Insights & attribution** *(ce qu'ils VENDENT)* | Dashboard vues/visiteurs, **attribution footfall**, tendances locales | `/api/google/stats` et ~rien d'autre | Métriques Google (impressions/clics/**visites**), dashboard insights |
| 5 | **Onboarding self-serve & dashboard** | Self-serve, one-click POS, no lock-in, multi-magasin, **gestion GBP** | Backing M9 + écrans E (logique) + **billing 3-tier Stripe** ; manque self-serve fluide + GBP | GBP management, one-click, self-serve |
| 6 | **Go-to-market & partenariats** *(LE goulot)* | Abonnement/magasin, volume pricing, **Trusted partner**, partenariats POS, 800k PdV | Billing prêt, **0 marchand, 0 partenariat** | 1 pilote → Clictill (avec preuve) → Trusted → réseau |

## La route phasée (le chemin critique gate sur le pilote)

- **Phase 0 — DÉBLOQUER : 1 pilote live.** Chantier **6a** + prouver l'e2e qualité sur lui (**3a**) + adapter Clictill réel si pilote Clictill (**1a**). *Tout en dépend.*
- **Phase 1 — CRÉDIBILISER :** SLA fraîcheur (3b), email-in FR (1b), amorcer Clictill (6b).
- **Phase 2 — DIFFÉRENCIER :** insights/attribution (4) + Meta/locator (2). *Transforme « on publie ton stock » en produit payant — sinon on est une commodité.*
- **Phase 3 — SCALER :** largeur ingestion (1c/1d), self-serve (5), Trusted partner (3d/6c).

---

## Chantier 6 — Pilote & partenariats *(décomposé — le point de départ)*

**Objectif (barre haute) :** passer de **0 → ≥1 marchand pilote LIVE** sur le feed Google,
**prouvé de bout en bout**, puis convertir en **partenariat Clictill**.

**Vérité d'ownership :** ce chantier est **~70 % Thomas** (relationnel/vente). Fable 5 ne
« trouve » pas un marchand — il **dé-risque le chemin et arme Thomas**. Owner par tâche :
🧑 Thomas · 🤖 Fable 5 · 🤝 joint.

### 6a — Lander & mettre live le 1er pilote *(le crux)*
- **6a.1 — Cibler le(s) marchand(s).** 🧑 Deerskin + 1 boutique multimarque *neuf* centre Toulouse (**PAS de seconde-main** : pas de GTIN propre → casse l'ancrage EAN). Décider **quelle caisse ils utilisent** (⟵ branche toute la technique).
- **6a.2 — Démo qui vend (shadow/preview).** 🤝 Montrer au marchand, AVANT qu'il dise oui, **ce qui serait publié sur Google** via `feed-preview` (`would_publish`/`blocked`). 🤖 Fable 5 : rendre cet écran présentable + un mode « démo sur son vrai catalogue ». 🧑 jugement visuel « pro ».
- **6a.3 — Dé-risquer l'onboarding technique.** 🤖 Selon la caisse (6a.1) : runbook pas-à-pas + tester le chemin réel (token ingest / connexion POS). *Si Clictill → tester l'adapter contre une vraie instance (jamais fait).*
- **6a.4 — Aller LIVE + prouver l'e2e (= 3a).** 🤝 Vrai catalogue → ingest → enrichissement → feed Google → **vérifier dans Merchant Center**. Barre de preuve : **rapport `EAN → photo/marque/catégorie` validé visuellement par Thomas** (la boucle ne coche pas « photos OK » seule).
- **6a.5 — Readiness Google du pilote.** 🤝 ≥ 11 offres GTIN publiables, **Google Business Profile vérifié + lié au Merchant Center**, feed quotidien. Checklist. 🤖 surfacer les manques dans l'UI (E2 readiness existe).

### 6b — Amorcer le partenariat Clictill
- **6b.1 — Récupérer l'historique du 1er contact.** 🧑/🤝 (via Gmail, sur autorisation) — qui, quand, réponse.
- **6b.2 — Mail de reprise.** 🤖 draft → 🧑 envoie. **Mener par la PREUVE** (démo + « on parle déjà votre API v2_10 »), pas par l'idée. Idéalement **après** un pilote (porter la preuve).
- **6b.3 — One-pager partenaire.** 🤖 « Two-Step rend votre caisse plus précieuse : **visibilité Google locale gratuite** pour vos ~150K PdV, le leader UK (NearSt) est absent de FR, intégration déjà construite. »
- **6b.4 — Angle « what's in it for Clictill ».** 🤝 différenciateur produit pour EUX, zéro coût de build (on lit déjà leur API), co-marketing.

### 6c — Cap vers Trusted Google LFP Partner
- **6c.1 — Documenter les exigences réelles.** 🤖 (recherche récente — ne pas se fier à la mémoire) : nb de marchands vérifiés, feed quotidien, process de vérification accuracy.
- **6c.2 — Checklist de conformité feed.** 🤖 s'assurer que notre feed passe la barre Google (parité gate déjà là, M6).
- **6c.3 — Candidature.** 🧑 quand les seuils sont atteints.

### 6d — Packaging & pricing FR
- **6d.1 — Benchmark pricing.** 🤖 NearSt ≈ £29–49/magasin/mois (tiers Lite/Advanced/Enterprise) vs nos 3 tiers Stripe existants.
- **6d.2 — Offre pilote.** 🧑 gratuit pour les 1ers pilotes ? (acquisition vs revenu).

### Ce que Fable 5 peut démarrer DÈS DEMAIN (sans attendre un marchand)
- 6a.2 (démo shadow/preview présentable) · 6a.3 (runbook + test adapter Clictill si pertinent) · 6b.2/6b.3 (mail + one-pager, drafts) · 6c.1/6c.2 (exigences Trusted + checklist) · 6d.1 (benchmark pricing).
- **Bloqué sur Thomas :** 6a.1 (cible + caisse), 6a.4 (le vrai catalogue), 6b.1 (historique), tout ce qui est envoi/relation.

---

## Chantiers 1–5 — à décomposer (prochaines sessions)
Sous-parties esquissées dans la matrice ci-dessus. On les décompose en tâches quand la
Phase 0 (pilote) est lancée, dans l'ordre de la route phasée.

## Légende ownership
🧑 Thomas (relation/vente/décision) · 🤖 Fable 5 (code/matériaux/recherche) · 🤝 joint.
