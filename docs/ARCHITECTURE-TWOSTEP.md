# Architecture Two-Step — V2 consolidée

> Document de référence architecturale côté codebase.
> Source : brain `06-Tech/Architecture-cible.md` V1 (2026-04-24, brainstorm 18+ agents) + consolidation 2026-04-25 (audits externes ignorés + angles morts stratégiques).
> Mis à jour : **2026-04-25**
> Owner : Thomas Bauland (solo)

---

## TL;DR

Two-Step rend visible le stock des commerçants locaux français sur **Google** (LFP) et bientôt **OpenAI** (ACP), à partir de leur POS (Square / Shopify / Lightspeed / Zettle / Hiboutik). Architecture en 4 couches empilées avec un pipeline d'enrichissement IA propriétaire (couche 2) qui constitue le moat opérationnel — pas data juridique.

**Cible** : 50 marchands payants stables fin année 1, 200+ en année 2.

---

## Sanctuaires verrouillés (non rouverts dans cette V2)

- **ADR-001** — Pivot CSV universel comme socle (POS = upgrade confort)
- **ADR-006** — Pipeline d'enrichissement unifié (cascade 4 vecteurs × 6 tiers)
- **ADR-007** — NO Chift V1 (pattern natif webhooks POS + feed XML LFP maison)

Tout le reste (timing, ordre des phases, infra, juridique, pricing, path 1er marchand payant) reste ouvert à la révision V2.

---

## Mission (rappel ADR-001)

> Le marchand local devient visible sur Google (et bientôt ChatGPT) sans lever le petit doigt, parce que Two-Step contrôle la qualité des données dès la facture fournisseur jusqu'au feed sortant.

---

## Architecture 4 couches (V2 — additions 2026-04-25 marquées)

```
┌─────────────────────────────────────────────────────────────┐
│  COUCHE 4 — Sorties                                         │
│  • Feed LFP XML (V1)                                        │
│  • [V2] Feed ACP JSON/CSV — OpenAI Agentic Commerce        │
│  • App consumer Two-Step (Next.js 16 + PWA)                 │
│  • Widget brand.com (Y2+)                                   │
└──────────────────────────────▲──────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────┐
│  COUCHE 3 — Storage (accélérateur opérationnel)             │
│  • Supabase : products / variants / merchants / stock       │
│  • [V2] product_channel (online/in_store/multi) — Google    │
│        product ID split obligatoire mars 2026               │
│  • ean_lookups cache cross-marchand (PAS moat juridique)    │
│  • webhook_events (idempotence) + cloture_sessions          │
└──────────────────────────────▲──────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────┐
│  COUCHE 2 — Enrichissement (moat opérationnel)              │
│  • Cascade 4 vecteurs × 6 tiers (ADR-006)                   │
│  • EAN lookup + Serper + Claude Vision + clean/dirty        │
│  • Parsing facture IA + promotion auto dirty→clean          │
│  • [V2] Inngest free tier — durable execution orchestrator  │
│        (50k events/mo gratuit, retry/replay/dashboard)      │
└──────────────────────────────▲──────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────┐
│  COUCHE 1 — Ingestion POS-agnostique                        │
│  • Webhooks natifs Square/Shopify/Lightspeed/Zettle         │
│  • [V1] Hiboutik adapter direct (3-5j)                      │
│  • CSV universel (fallback ADR-001)                         │
│  • Parsing factures fournisseur email                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Couche 1 — Ingestion POS-agnostique

**Sources actives** : webhooks natifs Square / Shopify / Lightspeed X-Series / Zettle (déjà en place, voir `src/lib/pos/`).

**À ajouter Phase 1** :
- **Hiboutik** adapter direct (3-5j) — OAuth2 + webhooks + SDK PHP
- **CSV universel** (fallback ADR-001) — déjà partiellement en place

**Pattern** : Partner API inspiré NearSt — les POS pushent vers Two-Step, pas de polling sauf Zettle (webhooks catalogue limités).

**Robustesse** :
- Table `webhook_events` avec `idempotency_key` (migration 061 existante)
- Dead-letter queue `failed_webhooks` (à durcir Phase 1)
- Replay manuel admin UI
- HMAC strict (plus de fail-open, voir gotcha #8)

**Pas de** : Chift (ADR-007), Nango en V1, agents locaux, Zapier/Make facturé marchand.

---

## Couche 2 — Enrichissement (moat opérationnel)

**Pipeline unifié** (ADR-006, mergé) :
```
resolve-ean (cache → UPCitemdb → EAN-Search → Open Food Facts)
  ↓
ai-verify (Claude Vision)
  ↓
reverse-search (Serper Google Images)
  ↓
match-product (Levenshtein 40% + word overlap 60%)
  ↓
cache-photo-r2 (rehost Serper sur Cloudflare R2)
  ↓
cache-taxonomy (catégorie Two-Step)
  ↓
classify (clean / dirty — Plan 07)
  ↓
products (visible=false, review_status='pending_review')
```

### V2 — Orchestrateur Inngest (gap découvert 2026-04-25)

Le pipeline 7 étapes actuel est probablement **inline avec try/catch dans une route Next.js**. À 50 marchands × 200 produits = 70k jobs concurrents avec timeout Vercel 60s = pipeline fragile.

**Reco V1.5** : adopter **Inngest free tier** (50k events/mo gratuit) :
- Retry exponential backoff automatique pour Serper / Anthropic
- Durable replay si Anthropic API tombe
- Dashboard temps réel par marchand sur "où en est l'enrichissement"
- Effort : 2-3j refactor

Alternative : Trigger.dev (TypeScript-native, no Redis). Pas Temporal (overkill enterprise).

### Cascade d'identification — 4 vecteurs × 6 tiers

Voir brain `06-Tech/Socle-identification-cascade.md` (ADR-006 sanctuaire).

**Vecteurs fiables non-pollables marchand** :
1. Code-barres imprimé fournisseur
2. Photo physique
3. PDF facture fournisseur
4. Identifiant sectoriel (ISBN / CIP)

**Tiers** : (1) sectoriels 100% — (2) Open bases gratuites — (3) Google Product Catalog — (4) CLIP Vectorize — (5) BERT entity matching — (6) EAN-Search EU fallback.

**Règle d'or** : un produit n'est visible consumer que si AU MOINS 1 vecteur a produit un match ≥ 0.95.

---

## Couche 3 — Storage Supabase

**Tables principales** : `products`, `variants`, `merchants`, `stock`, `invoices`, `webhook_events`, `cloture_sessions`.

### V2 — `product_channel` (gap critique — Google deadline mars 2026)

[Source PPC.land](https://ppc.land/google-forces-retailers-to-split-product-ids-by-march-2026/) : Google force les retailers à séparer les product IDs online vs in-store quand attributs diffèrent (prix, dispo, condition). À partir de mars 2026 obligatoire.

**Schema à ajouter Phase 1** :
- Colonne `product_channel ENUM('online', 'in_store', 'multi')` sur `products`
- Si `multi` détecté → générer 2 product IDs distincts par défaut
- Tester contre Merchant Center sandbox AVANT Phase 4

**Risque non-mitigé** : tout marchand multi-canal (60-70% cible mode/sport/électronique) verra son feed LFP rejeté si pas de split.

### `ean_lookups` requalifié — accélérateur, pas moat juridique

V1 le présentait comme "moat data effet réseau". Faux :
- EAN+brand+title+photo non protégeable par droit d'auteur ni base de données sui generis (art. L341-1 CPI)
- Sources publiques (OFF, OBF, UPCitemdb) = concurrent reconstruit en 3-6 mois
- RGPD : pas de précédent CNIL clair sur cache cross-tenant SaaS B2B

**Vrai moat** = densité géographique atomique + relation marchand + statut LFP Trusted (statut administratif, pas tech) + UX dirty→clean (algorithme).

À mettre à jour : pitch investisseurs, brain stratégie, communication marketing.

---

## Couche 4 — Sorties

### V1 actif

1. **Feed LFP XML maison** `/api/feed/lfp/[merchant_id].xml` — à construire Phase 1 (2-3j)
2. App consumer Two-Step (Next.js 16 + PWA) — existe, à renforcer
3. CSV export universel (fallback)

### V2 NOUVEAU — Feed ACP (gap critique — découvert 2026-04-25)

[OpenAI Agentic Commerce Protocol](https://openai.com/index/buy-it-in-chatgpt/) lancé 2026-02-16. Volume comparable à Google Shopping :
- 800-900M WAU ChatGPT × 50M shopping queries/jour
- Etsy live + Shopify 1M boutiques "coming soon" + PayPal 2026

**Format** : feed JSON ou CSV, refresh 15 min, **80% compatible avec le feed LFP XML existant** → adapter à coût marginal.

**Effort** : ~2j en parallèle de Phase 1 feed LFP. Frais 4% transactions PayPal/Stripe payés par marchand, pas Two-Step.

**Risque si on ne le fait pas** : marchands signés migreront vers Shopify ACP natif dès qu'ils l'apprennent.

### V3 (Y2+)

- Widget brand.com type Locally — JavaScript snippet (Sézane / Rouje / Jacquemus)
- Partenariats directs éditeurs POS FR avec statut Trusted LFP acquis

---

## Pricing revisited (à arbitrer — pas dans les sanctuaires)

Le pricing actuel ADR-002 (19€ pionniers / 29€ early / 39€ standard, verrouillé à vie) doit être confronté à l'unit economics réel.

**Calcul corrigé pour 50 marchands (mix 30 pionniers + 20 early)** :

| Poste | Montant /mois |
|---|---|
| Revenu brut (30×19 + 20×29) | 1 150 € |
| Stripe France effectif (2.2% + 0.25€ × 50) | -38 € |
| Infra V1 existante | -130 € |
| Add-ons cascade complète (Replicate CLIP 50€ + EAN-Search 19€ + Go-UPC 16€) | -85 € |
| Coût opportunité support Thomas (50 × 5h/an × 40€/h ÷ 12) | -833 € |
| **Marge nette** | **~64 €/mois (~6 %, pas 86 %)** |

> **Note self-review** : l'audit angles morts Agent B annonçait 9% (107 €). Recalcul honnête donne ~6 % (~64 €) — l'agent avait sous-estimé les heures support (5h/marchand/an × 50 / 12 mois = 20,8h/mois × 40€ = 832 €, pas 540 €). L'argument pour rouvrir le pricing est encore plus fort que ce que l'agent disait.

**Décision tranchée 2026-04-25 (ADR-009 supersede ADR-002)** :
- Plancher pionnier **25 €/mois** (au lieu de 19 €), verrouillé à vie
- **Pas de setup fee** — tout dans l'abonnement (décision Thomas : friction commerciale)
- Early (29 €) et Standard (39 €) inchangés
- **Gate budgétaire** : ne PAS activer Replicate CLIP avant 20 marchands signés

**Marge corrigée à 50 marchands (mix 30 × 25 + 20 × 29 = 1 330 €/mois)** :

| Poste | Montant /mois |
|---|---|
| Revenu brut | 1 330 € |
| Stripe FR effectif | -41 € |
| Infra V1 + add-ons cascade | -215 € |
| Support Thomas (mode wizard, 5h/marchand/an) | -832 € |
| **Marge nette mode wizard** | **~242 € (~18 %)** |
| Support post-cascade (1h/marchand/an) | -167 € |
| **Marge nette post-cascade** | **~907 € (~68 %)** |

**Pari acté** : la cascade Tier 1-2-3 (Phase 2) réduit le support de 5h → 1h/marchand/an. Si le pari échoue, marge reste à 18 %, viable mais juste, embauche 0,5 ETP à 15 marchands devient indispensable.

---

## Coûts infra projetés (V1→V3 vérifiés 2026-04-25)

| Phase | Marchands | Add-ons | Total infra /mois |
|---|---|---|---|
| **V1** | 0-50 | Inngest free, BetterStack free | **~40 €** |
| **V2** | 50-200 | + Replicate CLIP, + EAN-Search, + Hookdeck | **~150 €** |
| **V3** | 200-500 | + Nango Growth, + Vercel Pro, + Supabase PITR | **~250 €** |

---

## Trous identifiés 2026-04-25 — à intégrer

Détails dans brain `10-Angles-morts/Audit-angles-morts-2026-04-24.md` section MAJ 2026-04-25.

### Externes ignorés (5 trous)

| # | Trou | Effort | Phase |
|---|---|---|---|
| 1 | OpenAI ACP feed | 2j | Phase 1 |
| 2 | AI Act art. 50 disclosure (août 2026) | <1j | Phase 1 |
| 3 | CRA EU SECURITY.md (sept 2026) | 1j | Phase 0 ou Phase 2 |
| 4 | Veille Atalanda + LocaFox | 0 (monitoring trim.) | continu |
| 5 | Inngest orchestrator | 2-3j | Phase 1.5 |

### Angles morts stratégiques (5 angles)

| # | Angle mort | Mitigation |
|---|---|---|
| 1 | Death valley humain Phase 5 (50 marchands non atteignable solo) | Gate embauche 0.5 ETP à 15 marchands OU contrat formel apporteurs |
| 2 | Pricing 19€ marge réelle 9% | Plancher 25€ + setup 49€ (à arbitrer) |
| 3 | Google product ID split mars 2026 | Schema `product_channel` Phase 1 |
| 4 | `ean_lookups` pas moat juridique | Requalifier en "accélérateur opérationnel" |
| 5 | Bus factor sans playbook | `docs/continuity-playbook.md` Phase 0 + Bitwarden Family |

---

## Path vers 1er marchand payant — DÉCISION TRANCHÉE = γ (2026-04-25)

Thomas a tranché : **γ — Hybride structuré**.

### γ. Hybride structuré (path retenu)

- **Sem 1-2** : Phase 0 finie (encryption fix ✅, tracking, juridique amorce, playbook continuité) + 1 écran wizard onboarding Dear Skin (CSV upload → queue manuelle dashboard admin → enrichissement manuel Thomas → publie feed)
- **Sem 3-4** : Dear Skin onboardée + paie 1er mois (19€ ou 25€ selon arbitrage pricing en attente) + signal terrain commence
- **Sem 5-12** : cascade Tier 1-2-3 SOUS LE CAPOT (parce que ce sont les vecteurs les plus rentables sur le batch Dear Skin réel ; Tier 4-5 ensuite). Dear Skin tourne en mode "wizard semi-manuel" ces 8 sem (1-2h Thomas/sem)
- **Sem 13-16** : basculement fluide manuel → auto + démarchage 4-5 marchands Saint-Étienne

**Avantages** : revenue tôt + capture ACP en V1 + respect deadline Google product ID split mars 2026 + signal terrain immédiat + builder-bias mitigé.

**Risque acté** : Dear Skin paie pour produit semi-manuel pendant 3 mois. Mitigation à choisir entre :
- (a) facturation pleine 19€ ou 25€ + framing "tu paies pour qu'on construise avec toi"
- (b) design partner gratuit 3 mois explicite + facturation à partir sem 13

### Conséquences immédiates sur le Plan d'action production

Le `Plan-action-production-2026-04-24.md` (V1, 16 sem strict) doit être réécrit en V2 selon γ :
- Phase 0 : ajouter P0.13 (continuity playbook) ; objectif élargi inclut "wizard onboarding minimal Dear Skin"
- Phase 1 (sem 3-4 V1 → décalée) : devient "onboarding Dear Skin + 1er paiement" + ajouts P1.1bis (product_channel), P1.10 (ACP), P1.11 (AI Act art.50), P1.12 (Inngest)
- Phase 2 (sem 5-12) : cascade construite *pendant* que Dear Skin tourne, priorisée par les frictions vues en réel
- Phase 3-4-5 : timing inchangé sur le fond, mais avec 1 marchand payant validé en sem 3-4 au lieu de sem 14-16

### Historique alternatives évaluées

| Option | Verdict | Raison |
|---|---|---|
| α — Plan strict 16 sem | Rejeté | Builder-bias massif, 16 sem sans signal éco, deadline Google traversée |
| β — MVP sale 2-3 sem | Rejeté | Support Thomas haute friction non soutenable sans cascade en parallèle |
| **γ — Hybride structuré** | **Retenu** | Revenue tôt + cascade construite sous le capot + ACP captée + deadlines respectées |

---

## Sécurité & conformité (V2)

- ✅ Encryption AES-256-GCM v1: versioning + STRICT_DECRYPT (commit `ec24d79`, mergé 2026-04-25)
- ✅ HMAC vérifié sur tous les webhooks POS
- ✅ RLS Supabase partout
- 🟠 AI Act art. 50 disclosure (champ `enrichment_method` exposé UI + clause CGU) — **deadline 2 août 2026**
- 🟠 CRA EU procédure incident dès widget V2 — **deadline 11 sept 2026**
- 🟠 DSA notice & action page transparence — applicable depuis 17 fév 2024
- 🟢 Exemption EAA documentée mentions légales (<10 sal ET <2M€)

---

## Bus factor & playbook continuité

**Obligation Phase 0** : `docs/continuity-playbook.md` (3 pages max)

- Credentials chiffrés Bitwarden Family : Thomas + frère + 1 personne tiers de confiance
- Runbook redémarrage prod (Vercel / Supabase / Stripe / Cloudflare / Hetzner)
- Contacts critiques : Aftab Google / avocat / comptable / Resend / Sentry
- Clause incapacité temporaire dans RC Pro (Stello/Orus la propose)
- Gate Phase 5 : "frère doit avoir réussi 1 onboarding marchand seul" avant vacances >5j Thomas

---

## Liens brain (sources de vérité)

| Sujet | Fiche brain |
|---|---|
| Architecture V1 historique | `06-Tech/Architecture-cible.md` (2026-04-24) |
| Audit angles morts + MAJ 2026-04-25 | `10-Angles-morts/Audit-angles-morts-2026-04-24.md` |
| Plan d'action 16 sem | `01-Strategie/Plan-action-production-2026-04-24.md` |
| Cascade 4×6 | `06-Tech/Socle-identification-cascade.md` |
| Pricing | `01-Strategie/Pricing-tiers.md` (à rouvrir ?) |
| OpenAI ACP | `09-Veille/OpenAI-ACP.md` |
| Atalanda | `09-Veille/Atalanda.md` |
| LocaFox | `09-Veille/LocaFox.md` |
| Encryption fix | `06-Tech/Plan-fix-encryption-fail-open.md` (clos) |

---

## Versions

| Version | Date | Changement |
|---|---|---|
| V1 | 2026-04-24 | Brainstorm 18+ agents, 4 couches, cascade 4×6, plan 16 sem |
| **V2** | **2026-04-25** | **Consolidation post-audits (5 externes ignorés + 5 angles morts)** : ACP couche 4, Inngest couche 2, product_channel couche 3, requalification ean_lookups, pricing à arbitrer, path 1er marchand à trancher, playbook continuité Phase 0 |

## Décisions

1. ✅ **Path 1er marchand payant** — γ (Hybride structuré) — **tranché 2026-04-25**
2. ✅ **Pricing** — 25 € pionniers sans setup fee — **tranché 2026-04-25 (ADR-009 supersede ADR-002)**
3. ✅ **Design partner Dear Skin** — trial 2 mois standard ADR-002 inchangé. Sem 3 signature → sem 11 1ʳᵉ facture (cascade et bugs corrigés en parallèle). Pas de bonus design partner officiel — **tranché 2026-04-25**
4. ⏳ **1er pilote** — Dear Skin Shop seul, +Kap Pré-Go différé sem 5-6 (info POS Pré-Go requise) — **différé**

## Timing γ finalisé

| Sem | Phase | Action clé |
|---|---|---|
| 1-2 | Phase 0 | Encryption fix ✅, tracking CAC, juridique amorce, continuity playbook, wizard onboarding admin |
| 3 | Phase 1 start | Signature Dear Skin + trial 2 mois start + onboarding live |
| 4-10 | Phase 2 cascade | Cascade Tier 1-2-3 sous le capot pendant Dear Skin tourne en wizard semi-manuel |
| 11 | Phase 2 fin / Phase 3 | **Trial Dear Skin terminé → 1ʳᵉ facture 25 €**. Cascade auto opérationnelle. Bugs corrigés. |
| 12-16 | Phase 4 | Démarchage 4-5 marchands Saint-Étienne avec produit propre |
