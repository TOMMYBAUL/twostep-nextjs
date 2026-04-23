# Cycle 01 — Ingestion

*Généré 2026-04-23 ~01:10 CET. Source : 15 graphify Nexus + 4 gitnexus codebase + lecture directe fiches critiques (claude-mem MCP timeout, compensé par lectures directes).*

---

## 1. État réel du projet Two-Step au 2026-04-23

### Fondations business
- **Équipe** : Thomas (solo + frère en backup moral/occasionnel)
- **Positionnement** : SaaS B2B français — rendre visible aux consommateurs du quartier le stock des commerces indépendants. **Pas** que la mode — toute catégorie avec des marques (électronique, pharma, sport, jouets…).
- **Pricing verrouillé à vie** : 19€/mois pionniers (1-30), 29€ early (31-50), 39€ standard (51+). Pas de commission sur ventes. 30 jours gratuits. Verrouillage à vie = création d'urgence.
- **Juridique** : RCS Toulouse 102 932 290, immatriculé 2026-04-13. Cadre apporteurs d'affaires documenté (20% récurrent).
- **Infra coût** : ~9€/mois (Hetzner rembg, Infomaniak, domaine) → marge 75% théorique à échelle.

### Stack technique (après merge de cette nuit)
- Next.js 16 (App Router, React 19, Tailwind v4) + Supabase (Postgres + Auth + Storage + RLS) + Stripe + Vercel.
- Pipeline enrichissement : cascade 4 sources EAN (EAN-Search, UPCitemdb, Open Beauty Facts, Open Products Facts) + Serper Google Images + AI verify (Groq → Gemini → Anthropic Haiku) + cache propriétaire `ean_lookups` avec pg_trgm fuzzy reverse-search.
- POS adapters : Square (en production), Shopify, Lightspeed, Zettle — tous code dispo.
- Queue de validation produits (`review_status` enum : pending_review, visible, rejected) introduite hier soir, produits pending cachés du catalogue public.
- Writeback POS (Option B) **code présent mais gated derrière `POS_WRITEBACK_ENABLED=true`** (flag env absent en prod = désactivé, ce qu'on veut).
- Feed Google LFP (Voie A) : format conforme spec Aftab après le merge (availability "in stock"/"out of stock", brand, description, title ≤150c, EUR FR).
- Voie B LFP (`lfpInventories:insert`, `lfpStores:insert`, `lfpSales:insert`) : **non implémentée**, attend confirmation d'activation par specialist Google.

### Métriques prod (snapshot brain 2026-04-23, à re-vérifier)
| Métrique | Valeur | Cible Phase 1 (J+90) |
|---|---|---|
| Marchands payants actifs | **0** | 1 minimum |
| Marchands en signup pending | 6-7 (+ 1 test ce soir) | — |
| Produits totaux | ~104 | — |
| Produits avec EAN | ~15 (20%) | >50% |
| Pos_connections actives | 0 | 1+ |
| Google Merchant connections | 0 | 1 (LFP) |
| Cache `ean_lookups` | ~0-30 rows (après test) | >100 |

**Signal fort** : on est à J+30 de Phase 1. 0 marchand payant. La cible (1 actif J+90) exige de signer dans les **8 semaines à venir**.

---

## 2. Cartographie Nexus — 16 communities labellées

Le graphify a identifié 269 nodes / 637 edges / 16 communities. Résumé des communities par taille décroissante (god-nodes entre parenthèses) :

| # | Community | Taille | Concept central |
|---|---|---|---|
| 0 | Infra + Finances + Juridique | 31 | Pricing, Unit economics, Stripe, CCI, URSSAF |
| 1 | Enrichissement + Dashboard stock | 29 | **Pipeline enrichissement (35 edges — god #1)** |
| 2 | Intégrations POS + Architecture stock | 28 | **POS-ERP landscape FR (21 edges)**, Concept V1 (19 edges) |
| 3 | Angles morts + Équipe | 27 | Regard critique business (23), Hypothèses, Risques |
| 4 | Stack technique + Audits qualité | 26 | **Architecture overview (29 edges — god #2)** |
| 5 | Prospection + Outbound | 25 | Funnel 4 vagues, Top 100 prospects |
| 6 | Design + Produit user-facing | 23 | Charte v2, Features V2, shadcn/21st.dev |
| 7 | Plan 6 mois + Territoire | 20 | **Plan 6 mois (24 — god #3)** |
| 8 | Cold start + Google LFP | 18 | **Google LFP/LIA (23 — god #4)**, Cold start (21) |
| 9 | Vertical libraires + Terrain | 16 | Place des Libraires, Medialog, Dear Skin |
| 10 | Outillage Claude Code | 15 | Skills, MCPs, graphify, claude-mem |
| 11 | Sources données produit (EAN) | 7 | UPCitemdb, GS1, Alkemics |
| 12-15 | Orphans (Hiboutik, EBP, Chift) | 1 chacun | — |

**Observation majeure** : Community 3 (Angles morts + Équipe) a 27 nodes avec le god-node `Regard critique business`. Ça veut dire que **le brain lui-même est massivement conscient du risque d'auto-illusion**. C'est rare et c'est un actif.

---

## 3. Pipeline d'enrichissement — état post-merge

### Ce qui marche (validé à 4/4 sur test limité 2026-04-22)
- `resolveAndEnrich` (src/lib/enrichment/resolve-ean.ts:34) orchestre la cascade
- `verifyEanMatch` (src/lib/enrichment/ai-verify.ts:12) fait la vérification sémantique post-cascade
- `categorizeProducts` (src/lib/ai/categorize.ts:24) mappe sur taxonomie Two-Step
- Cache `ean_lookups` enrichi (photo_url R2, taxonomie, hit_count, reverse-search)

### Ce qui reste fragile
- **Brand auto-extraction** : manque pour "catégorie=mode" vs "catégorie=chaussures" (faux positif historique Adidas Samba OG → "mode" au lieu de "chaussures"). Code `categorize.ts` existe mais qualité non mesurée.
- **AI verify silencieusement disabled** pendant plusieurs mois (`ANTHROPIC_API_KEY` vide en prod) → tous les enrichissements passés potentiellement corrompus. Fix 2026-04-22 (cascade providers Groq → Gemini → Anthropic) + safe-fail si tout plante.
- **Rate limits Groq** non gérés dans le loop ; 429 silencieux possible → dégradation invisible.

### Coût marginal par marchand (calcul brain)
- ~0.50€/marchand de coûts IA pour enrichir le catalogue initial.
- Cache propriétaire `ean_lookups` bonifie cross-marchand : le 2e marchand vendant la même Nike Air Force 1 ne repaie pas l'enrichissement.

---

## 4. État Google LFP

### Prérequis techniques couverts
- Merchant Center ID 5755722759 actif, OAuth configuré (client `516565007311...apps.googleusercontent.com`)
- Voie A (productInputs:insert Merchant API) implémentée end-to-end : `/api/google/auth`, `/api/google/callback`, `/api/cron/google-feed` (POST endpoint avec bearer CRON_SECRET)
- Feed format conforme spec Aftab (tickets 5-9519000040422 + 6-7242000040976)
- 4 sources GTIN cascade + AI verify + R2 photos HTTPS
- Dossier specialist prêt : `docs/prospection/google-lfp-preparation-v2.md` (one-pager EN + email template + checklist pré-call)

### Prérequis business absents
- **0 marchand connecté à Google Merchant** → feed alimenté mais vide
- **0 marchand pilote pour vérification en magasin** — requis pour statut Trusted (5 marchands vérifiés minimum)
- Candidature en review, specialist pas encore appelé (1-2 days annoncés par Bjorn, réaliste 5-15 jours)

### Angle mort majeur identifié ce soir
Thomas pensait que LFP nécessite writeback POS opérationnel → **c'est faux**. Le feed LFP peut être généré depuis la DB Two-Step alimentée par CSV universel (stratégie V1 validée ADR-001). Writeback POS = confort marchand, pas prérequis Google.

---

## 5. Stratégie cold start — Saint-Étienne / Carmes / Saint-Rome

### Le réseau atomique (Andrew Chen, NFX, Chris Dixon)
- 1 quartier, ~20 boutiques, rayon 800m marchable, ~300 conso cible
- Interdiction d'éparpillement (cause #1 échec Pointy/NearSt/Cocote)
- Single-player value AVANT marketplace (Chris Dixon "come for the tool, stay for the network") : Google LIA, catalogue enrichi, SEO boutique, rapport hebdo

### Tactiques recrutement
- "30 places pionnier verrouillées à vie" (urgence + rareté ancrées sur le quartier)
- "Votre voisin X a signé" (social proof)
- Exclusivité par catégorie ("1 sneakers par quartier")
- Carte quartier colorée (boutiques inscrites vs non-inscrites)

### Leads chauds identifiés (brain prospection)
- **Dear Skin Shop** (Toulouse + Paris) — très chaud, contact `dearskinshop@icloud.com`, POS SumUp→Zettle en migration
- 4 autres non-nommés spécifiquement dans le public brain (vérifier `docs/prospection/leads-tracker.md`)
- Préqualification non commencée (brain dit "à J+30 pas démarré")

---

## 6. Hypothèses critiques H1-H8 (aucune testée en conditions réelles)

| # | Hypothèse | Validation prévue | Si invalide |
|---|---|---|---|
| H1 | Onboarding marchand < 30 min | 3 pilotes chronométrés | service "on fait pour vous" payant |
| H2 | Marchand tient 30j sans support | Logs usage 3 marchands | Coach onboarding Hormozi |
| H3 | LFP → 5+ visites/mois | GMC clicks après 1 mois | Repositionner LFP comme argument, pas canal |
| H4 | Pitch 19€ convertit >30% leads chauds | 10 leads en semaine | Repenser pricing (gratuit 3 mois ? freemium ?) |
| H5 | Conso préfère Two-Step à Google Maps pour produit précis | 20 interviews quartier | Pivot vers découverte plutôt que recherche |
| H6 | Bouche-à-oreille marchand fonctionne à saturation | Question onboarding après 10 signés | Continuer push direct |
| H7 | CSV POS parsables à 90% sans préprocessing | 10 CSV terrain réels | Ajouter préprocesseur Claude Vision (coût IA ×2) |
| H8 | 20 boutiques/quartier → 300 conso/mois | Analytics à 20 marchands | Plus marchands ou + marketing local |

**Rien n'est testé.** C'est le cœur du risque actuel du projet.

---

## 7. Concurrents morts — leçons brutes

- **Pointy** (UK) : acquisition Google 2020, éparpillement US pur, service stoppé.
- **NearSt** (UK) : pivot vers enterprise (Google for Retail), ne cible plus les petits indépendants.
- **Cocote** (FR) : 4800 marchands inscrits / seulement 20% actifs, **PAS d'intégration POS**, 70€ GMV/marchand/an (très faible), commission 7% (plutôt que subscription).
- **Epicery** (FR) : -5.6M€ de pertes, quick commerce moribond.
- **Proximis/Planet** : enterprise 1400€/mois, aucun chevauchement avec Two-Step.
- **Leclerc Drive** : stack Infomil, sync 15min, coût massif (inapplicable à 9€/mois).

**5 blocages structurels identifiés** (cf. Nexus `Concurrents-echecs`) :
1. Éparpillement géographique (zéro densité)
2. Pas d'intégration POS → catalogue non tenu à jour
3. Commission sur vente (le marchand ne voit pas ROI clair)
4. Outil purement marketplace (single-player value = 0)
5. Recrutement conso avant marchands (et pas l'inverse)

**Two-Step se positionne opposé sur les 5.**

---

## 8. Angles morts identifiés cross-source (pour cycle 2)

En croisant brain + code + MEMORY.md tagué ce soir, je vois ces **trous non-traités ou sous-traités** :

**A. Onboarding CSV concret**
- Le brain dit "tous les POS exportent CSV" (validé) et "pipeline parse 90%" (H7 non testé)
- Mais : quel UI marchand pour uploader ? Est-ce que `/api/catalog/import` (existe dans gitnexus) a une UX testée ? Aucune fiche brain ne décrit le flow UI "j'exporte mon CSV Shopify → je l'uploade dans Two-Step".

**B. Google LFP en parallèle sans marchands**
- Dossier prêt mais aucun marchand connecté pour demo. Si specialist demande "montrez-moi un feed live" → on a seul le seed "Sole Store" (15 produits).
- Question non résolue : *peut-on demander à Google de reviewer AVANT d'avoir 5 pilotes, ou doit-on signer d'abord les 5 ?* (écrit dans l'email template mais pas répondu).

**C. Décrémentation stock sans POS**
- Brain valide "décrémentation manuelle ok, vélocité = jours pas minutes". Mais : quelle UX pour le marchand non-POS ? Le plan 06 (clôture du soir) propose un mode "j'ai vendu X de Y ce soir" mais UX jamais testée en condition réelle.

**D. Écart entre valeur produite standalone et valeur networked**
- Cold start dit "valeur avant marketplace" : Google LIA, catalogue enrichi, SEO.
- Mais combien de marchands disent "je paie 19€/mois pour avoir mon SEO boutique et une fiche Google" ? Zéro validation.

**E. Marge opérationnelle vs temps de Thomas**
- Unit economics dit 9€ coût + 19€ revenu = 10€ marge/marchand.
- Mais : combien de minutes Thomas passe par marchand (onboarding + support + check-in WhatsApp hebdo) ? À 20 marchands × 30 min/semaine = 10h de Thomas, sans compter la vente. Le modèle économique tient-il si Thomas ne peut pas embaucher ?

**F. Place des Libraires comme modèle — extrapolable vraiment ?**
- Ratio cité : 15 conso / 1 marchand. Mais Place des Libraires est financée par Dilicom (chaîne du livre) + 150€/an (pas 228€ comme Two-Step). Modèle pas identique.

**G. Rate limits Groq / Gemini sous charge réelle**
- AI verify cascade prévue Groq → Gemini → Anthropic. Mais quels sont les rate limits Groq sur un compte gratuit sous charge (ex: 50 produits enrichis en 2min) ?

**H. Feed Voie A vs Voie B LFP — décision binding**
- Voie A (Merchant API standard) : implémentée mais pas indéxée par Google pour LIA (c'est du basic Shopping, pas Local).
- Voie B (lfpInventories:insert) : seul chemin vers vrai LIA mais nécessite activation Google.
- Question non traitée : **si Google active Voie B, combien de code faut-il réécrire ?** Estimation dans le brain : rien de précis.

---

## 9. Métacognition — ce que cette ingestion révèle

1. **Le brain de Thomas est exceptionnellement dense et lucide** (163 fiches, god-nodes pertinents, regard critique anti-builder-bias documenté). Le volume d'information structurée est un actif rare.
2. **Le fossé entre ce qui est codé et ce qui est testé terrain est massif**. Tout le pipeline (enrichissement, LFP, POS, Stripe) est plus mature que le réseau de marchands (0/1 cible).
3. **La stratégie cold start est théoriquement solide** (Andrew Chen/Chris Dixon/NFX) mais 100% non exécutée sur le terrain au 2026-04-23.
4. **Le brain s'auto-critique** — c'est bon signe mais fait peser un risque de sur-analyse (cf. la session 2026-04-23 frustration où 6h ont été passées à coder writeback POS au lieu de prospecter).
5. **Angles morts concrets identifiés ci-dessus (A-H)** → matière pour générer les 20 questions du cycle 01 étape 2.

---

*Mots : ~2300. Quotas cycle 01 étape 1 : 15 Nexus ✅ · 4 gitnexus (au lieu de 10, compensé par 4 fichiers lus) ⚠️ · 0 claude-mem (MCP timeout) ⚠️ · lecture complète Hypothèses + Cold-start (compensation)*
