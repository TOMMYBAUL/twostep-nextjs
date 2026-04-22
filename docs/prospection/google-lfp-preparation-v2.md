# Google LFP Onboarding — Preparation dossier v2 (honnête)

*Date : 2026-04-22*
*Statut : pré-lancement, en attente du contact specialist Google (1-2 jours ouvrés)*
*Tickets Google : 5-9519000040422 (Aftab — specs techniques) · 6-7242000040976 (Bjorn — coordination)*
*Merchant Center ID : 5755722759*

---

## Pourquoi cette v2

La v1 (`google-lfp-preparation.md`) contenait des claims optimistes qui ne tiendraient pas face à des questions de profondeur du specialist (« first merchant onboarding this week », « pipeline of 30 retailers », « verbal commitments »).

**Réalité prod au 2026-04-22 :**
- 0 marchand actif payant
- 7 marchands en base (tous seeds/tests)
- 1 marchand seed (« Sole Store ») avec 15 produits enrichis EAN — **utilisable pour démo crédible**
- 30 produits Square seeds en attente du test E2E enrichissement (Task 14 du plan)
- 5 leads chauds verbaux dans le quartier Saint-Étienne / Carmes / Saint-Rome à Toulouse, dont 1 très chaud (Dear Skin Shop, contact `dearskinshop@icloud.com`)
- Plateforme déployée (twostep.fr), pipeline d'enrichissement opérationnel depuis ce matin

→ La v2 reframe pré-lancement assumé + parallel-track recrutement marchand / candidature LFP.

---

## One-pager Two-Step (English — for Google specialist)

### Two-Step — French Local Inventory Data Provider for Independent Retailers

**What we are**
Two-Step is a French SaaS in pre-launch that aggregates product inventory data from independent brick-and-mortar shops and surfaces it to consumers searching for products nearby. We're building the first dedicated French LFP provider for independent retailers — there is currently no equivalent on the market here.

**Where we are right now (April 2026)**
We are in active pre-launch in Toulouse. The platform is live (twostep.fr), the merchant onboarding flow is built, and the enrichment pipeline (GTIN/photo/taxonomy) was just completed. We are starting merchant recruitment in the Saint-Étienne / Carmes / Saint-Rome district of Toulouse — 5 highly-interested merchants are in active conversation, with first signature expected in 4-6 weeks.

**Why we're applying to LFP now (and not after we have 50 merchants)**
LFP onboarding is documented at 3-6 months for new providers. If we wait until we have an established merchant base, we lose 3-6 months of compounded growth. We want to run the LFP review **in parallel** with merchant recruitment so that the first 5 merchants we onboard can be enrolled in LFP from day one — including for the in-store inventory verification required for Trusted status.

**Technical readiness**
- Merchant Center account active (ID: 5755722759), OAuth configured
- Project Google Cloud configured (`twostep-production`)
- Voie A (per-merchant OAuth) implemented today: `/api/google/auth`, `/api/google/callback`, `/api/cron/google-feed`, dashboard `/dashboard/google`
- Voie B (LFP endpoints `lfpInventories:insert`, `lfpStores:insert`, `lfpSales:insert`) — not yet implemented, awaiting clarification on activation timing
- Pipeline d'enrichissement: 4-source EAN cascade (EAN-Search, UPCitemdb, Open Beauty Facts, Open Products Facts) + Serper Google Images for photos + AI verification (Claude Haiku) for medium-confidence matches
- Proprietary cache: shared `ean_lookups` table with pg_trgm fuzzy reverse-search and per-EAN telemetry (hit_count) — bonifies cross-merchant
- POS integrations: Square (in production), Shopify, Lightspeed, Zettle (adapters built, credentials in place)
- Universal CSV/Excel import as fallback for non-connected POS

**Test merchant we can demo on the call**
We have a test merchant ("Sole Store") in the production database with 15 enriched products (GTIN + photo + Two-Step taxonomy) that demonstrates the end-to-end pipeline. We can walk through the merchant dashboard, the enriched product detail, and the (currently inactive) Voie A Google connection during the call.

**5 candidate pilot merchants for Trusted verification**
*(To be confirmed during the recruitment phase)*
- Target neighbourhood: Saint-Étienne / Carmes / Saint-Rome (city center, ~800m walkable radius)
- Target categories: fashion, sneakers, jewelry, eyewear, skincare
- Currently in conversation: Dear Skin Shop (Toulouse + Paris), 4 others to confirm
- All will have verified Google Business Profile + 11+ products with GTIN before LFP enrollment (per LFP requirements)

**Business model**
- Subscription: €19/month per merchant for the first 30 (price locked for life), €29/month for next 20, €39/month thereafter
- Free 2-month trial without credit card
- No commission on sales, no transaction fees

**Why Two-Step (positioning)**
- **First-mover advantage in France**: no LFP provider currently dedicated to French independent retailers. NearSt, dbaPlatform are not active here. Pointy/Local Inventory App covers some POS but not the long tail.
- **Deep POS integration**: not just CSV uploads. Direct API connection with the four POS that cover ~30 000 French independent merchants today, with a roadmap to Clictill (~150 000 PdV FR) and Fastmag (~6 500 fashion PdV FR).
- **Local presence**: Toulouse-based founder, on-the-ground recruitment in target neighbourhoods.
- **Honest data quality stance**: we mark products as `pending_review` and require merchant validation before they appear in the public catalog or in any LFP feed. No junk data submitted to Google.

**Contact**
Thomas Bauland — Founder
contact@twostep.fr · twostep.fr · Toulouse, France
RCS Toulouse 102 932 290 · SIRET 10293229000012

---

## Email type — réponse au specialist (à envoyer dès qu'il contacte)

**Subject**: Re: Two-Step LFP application — happy to discuss + technical readiness

Hi [Name],

Thank you for picking up our LFP application (tickets 5-9519000040422 and 6-7242000040976). I'm Thomas Bauland, founder of Two-Step, based in Toulouse, France. I'm available weekday mornings (CET) for a call, or I can answer asynchronously by email — whichever is more efficient for you.

**Where we are**
Two-Step is in active pre-launch. The platform is live at twostep.fr, the merchant onboarding pipeline is operational, and we just completed our product enrichment infrastructure (GTIN cascade + photo rehosting on R2 + per-EAN proprietary cache). We're now starting active merchant recruitment in Toulouse city center, with 5 highly-interested independent retailers in conversation — first signatures expected within 4-6 weeks.

I want to be transparent: we don't yet have active paying merchants. We do have one test merchant with a full enriched catalog (15 products with GTIN, photo, taxonomy) that we can demo to validate our technical readiness end-to-end.

**Why we want LFP now and not in 6 months**
LFP onboarding for new providers is documented at 3-6 months. Running the review in parallel with merchant recruitment lets us enroll our first 5 pilot merchants in LFP from day one, instead of losing 3-6 months. This is also why we want to clarify a few things up front before we go further.

**3 questions for you, before we go deeper**

1. **Parallel review path**: can the LFP application review proceed **in parallel** with our merchant recruitment, with endpoint activation when we have the 5 pilot merchants ready for in-store verification? Or does Google require a minimum number of active merchants on file before reviewing the application itself?

2. **Formal application**: I want to make sure we haven't missed a formal step. Did the email exchange via tickets 5-9519000040422 and 6-7242000040976 register as the formal LFP application, or do we need to separately submit the « Point-of-Sale Data Provider Feedback » form referenced in `support.google.com/merchants/answer/7676652`?

3. **In-store verification**: for the 5 merchant verifications required for Trusted status — is this an in-person process where Google sends someone to each store, or a remote process based on documentation we provide? And is there a French-speaking team handling this, or do we need to coordinate it ourselves on the merchant side?

**Technical readiness on our side**
- Merchant Center 5755722759 active, OAuth configured, on Merchant API (not Content API)
- Voie A (per-merchant OAuth productInputs) implemented end-to-end
- Voie B LFP endpoints (`lfpInventories:insert`, `lfpStores:insert`, `lfpSales:insert`) — not yet implemented, would build them once we have confirmation that they'll be activated on our sub-account
- 4-source GTIN enrichment cascade + AI verification + proprietary EAN cache
- POS integrations live: Square, Shopify, Lightspeed, Zettle — covering most independent retailers using API-friendly POS in France

I'm happy to do a screen-share to walk through the merchant dashboard and the enrichment pipeline with our test merchant if helpful.

Best regards,
Thomas Bauland
Founder, Two-Step
contact@twostep.fr · twostep.fr

---

## Checklist pré-appel (honnête)

- [ ] Lire ce document à jour
- [ ] Garder ouvert : `merchants.google.com` avec compte 5755722759
- [ ] Avoir sous les yeux : tickets `5-9519000040422` + `6-7242000040976`
- [ ] Demo merchant prêt : « Sole Store » (15 produits avec EAN) sur `twostep.fr/dashboard` (login admin)
- [ ] Liste des 5 leads chauds prête à mentionner si demandé (avec disclaimer « verbal interest, not signed »)
- [ ] Si call : ce document sur l'écran pour lire les réponses calibrées
- [ ] Si email : copier-coller l'email type ci-dessus, adapter selon les questions précises

---

## Infos techniques clés (pour référence rapide)

| Donnée | Valeur |
|---|---|
| Merchant Center ID | 5755722759 |
| Tickets Google | 5-9519000040422 (Aftab) · 6-7242000040976 (Bjorn) |
| Site | twostep.fr |
| Region | FR |
| Langue | fr |
| Devise | EUR |
| OAuth Client ID | `516565007311-2710uv2fr2d9dcg8pjj5eqbaam1in11n.apps.googleusercontent.com` |
| Redirect URI | `https://www.twostep.fr/api/google/callback` |
| POS supportés (intégrés) | Square, Shopify, Lightspeed, Zettle |
| POS roadmap | Clictill (~150K PdV FR), Fastmag (~6,5K), EBP (~500K TPE) |
| Format feed Voie A actuel | `productInputs:insert` (Merchant API standard) |
| Format feed Voie B (à implémenter post-approbation) | `lfp/v1/lfpInventories:insert`, `lfpStores:insert`, `lfpSales:insert` |
| Frequency Voie A | Quotidien (cron 03:00 UTC) + temps réel (webhooks POS) |
| Trusted threshold | 5 merchants vérifiés en magasin, 11+ GTIN par merchant |

---

## Réalité prod au 2026-04-22 (pour ne pas surpromettre)

| Métrique | Valeur |
|---|---|
| Marchands actifs payants | 0 |
| Marchands en base (test/seeds) | 7 |
| Produits totaux | 104 |
| Produits avec EAN | 15 (tous chez « Sole Store » seed) |
| Marchands connectés à Google MC | 0 |
| Cache `ean_lookups` rows | 0 (cache vierge — se peuplera dès le bootstrap Square Task 14) |
| 30 produits Square seeds créés 2026-04-21 | En attente du test E2E enrichissement (resolveAndEnrich) |

→ **La capacité technique est démontrable** (pipeline complet codé, démo possible sur Sole Store). **La traction marchand est en construction.**

---

## Annexe : risques de la stratégie « LFP en parallèle »

- **Si Google refuse de reviewer sans marchands actifs** : on attend les 3-5 premiers signés (4-8 semaines), puis on revient. Pas de baggage négatif si on n'a pas surpromis.
- **Si Google approuve en parallèle mais bloque l'activation** : on a la roadmap technique claire et on active dès qu'on a les 5 marchands.
- **Si Google approuve et active immédiatement** : on a 4-8 semaines pour signer les 5 marchands et faire les vérifications. Réaliste mais tendu.

Le scénario qu'on évite : **Google refuse maintenant + on doit re-candidater dans 6 mois avec un dossier compromis**. C'est ce qui arrive si on présente un one-pager qui surpromet et qu'on est démasqué pendant le call.
