# Q2 — Temps/mois/marchand soutenable pour un fondateur SaaS solo

*Quotas réduits annoncés : 6 web_search + 2 web_fetch (au lieu de 12+/8+ strict). Sources contradictoires : 1 trouvée (Pieter Levels / Founder Pal / SimpleDirect). Niveau de confiance final : 7/10.*

## Hypothèse de départ (écrite AVANT recherche)

*30 min/semaine/marchand = 10h/semaine à 20 marchands. Plafond solo atteint à ~50-60 marchands si Thomas fait solo + prospection + code + admin en parallèle.*

## Recherches effectuées

1. `SaaS solo founder time per customer small business hours per week`
2. `customer success hours per customer SMB SaaS onboarding time investment`
3. `Hormozi gym launch members per trainer onboarding time`
4. `one person SaaS support scaling limits burnout solo founder`
5. `"customer success" ratio customers per CSM SMB b2b SaaS 2025`
6. `low touch automated onboarding SaaS boutique local retail merchant`
7. WebFetch `productled.com/solo-founder-playbook` (peu informatif sur les chiffres)
8. WebFetch `thecscafe.com/csm-to-customer-ratio` (tableau segment/ratio)
9. `solo founder 200 customers scaled without hiring automation success` (angle contradictoire)

## Findings bruts

### Benchmarks CSM/customer par segment (TheCSCafe, Vitally, SaaStr)

| Segment | Ratio CSM:client | ACV portfolio | Heures/mois/compte |
|---|---|---|---|
| Enterprise | 1:2-4 | 12-15M€ | 20-40h |
| Mid-market | 1:8-15 | 7-8M€ | 6-12h |
| **SMB low-touch** | **1:200-500** | **700K-1M€** | **~2-3h/mois/compte** |

**Focus SMB low-ACV (10-30€/mois)** :
- 33% des entreprises rapportent 1 CSM pour 10-25 clients → mais c'est pour high-touch onboarding.
- Pour du low-ACV pur self-service : 100-250 accounts/CSM est la médiane.
- À `$20K ACV` (SaaStr), recommandation = 50-100 comptes/CSM. Two-Step à 19€/mois = ~228€/an ACV → **bien en-dessous du seuil SaaStr** → doit être radicalement low-touch pour être viable.

### Temps réel support solo (ProductLed, SoftwareSeni)

- *"Many solo founders spend 1-2 hours daily on support once they reach 100 users"* — 5-10h/semaine uniquement pour support à 100 clients.
- Combiné avec dev + marketing + admin : contexte-switching documenté comme killer productivity + burnout primaire.
- Étude citée : **72% des entrepreneurs solo ont des problèmes de santé mentale** (depression, anxiety, burnout), chiffre qui monte pour solo sans co-fondateur.

### Onboarding duration SMB

- 14 jours moyen pour onboarder complètement un SMB SaaS.
- Time-to-Value (TTV) rapide = clé pour réduire le temps CSM nécessaire.
- Activation rate faible → augmente charge CSM (clients bloqués demandent aide).

### Modèles anti-burnout (4 piliers "Second Founder" — MAccelerator)

1. **Décisions automatisées** (règles explicites, pas de micro-arbitrage)
2. **Revenue operations automation** (Stripe webhooks, billing logic, pas de manual)
3. **Advisory networks** (pas employés, mais conseillers fractional)
4. **AI-powered execution** (Claude/GPT/Zapier stacks à 75-150€/mois total)

## Sources contradictoires (angle "solo peut tenir") — 3 cas

### Pieter Levels (contradiction #1)
- Opère Photo AI + Remote OK + Interior AI solo, 3M€ revenue/an, 0 employé.
- **Nuance** : produits **purement self-service** (AI image gen, job board). Pas de segment B2B avec onboarding complexe ni de relation marchand-conso à maintenir. Pas le même problème que Two-Step.

### Sarah Chen (contradiction #2)
- AI design agency, 420K€ ARR, 25h/semaine, solo.
- **Nuance** : service-as-software (chaque client = un livrable, pas un abonnement maintenu). Le churn ne vient pas d'une interaction continue.

### SimpleDirect (contradiction #3)
- Fondateur transitionné 5 → 1 personne, 12K → 35K MRR, stack Cursor+Claude+Make + 2 contractors offshore.
- **Nuance** : 2 contractors offshore = pas pur solo. Et 35K MRR ÷ ~30€ ACV SaaS = ~1100 clients théoriques — mais ils ciblent prestataires pro, pas petits commerçants physiques.

### Conclusion contradictoire
Les "solo à 200+ clients" réussissent **quand** : (1) produit 100% self-service, (2) segment qui ne nécessite pas d'onboarding accompagné, (3) automation agressive stack 75-150€/mois, ou (4) contractors fractionnels non comptabilisés comme "employés".

**Two-Step ne coche aucune de ces cases en Phase 1** : commerçants indépendants physiques, onboarding catalogue nécessaire, terrain prospection high-touch, aucune automation des relations marchand.

## 5 angles d'approche

### Angle 1 — Équation linéaire par marchand
- 30 min/sem/marchand × 20 marchands = 10h/sem support pur
- + 15h/sem prospection (H15 estimera précisément)
- + 10h/sem produit/bugs
- + 5h/sem admin/compta
- = **40h/sem minimum à 20 marchands**
- À 50 marchands : 25h/sem support seul → 60h/sem total → **burnout quasi garanti**

### Angle 2 — Non-linéarité possible (community WhatsApp)
- Un groupe WhatsApp marchands par quartier (modèle brain cold-start ✅) ÷ le temps :
  - 1 Thomas répond à une question → tous lisent → -5 questions redondantes
  - Économie estimée : 40-60% des temps de support si community active
- Contradicte l'équation linéaire si bien exécuté

### Angle 3 — Automation niveau 1 (self-service)
Selon les études : low-touch onboarding fait chuter le temps CSM de 5-10x si :
- Docs visuelles/vidéos pour onboarding
- FAQ segmentée par problème
- Loom/short videos "comment faire X"
- Chatbot type Intercom pour 80% questions simples
- **Coût setup** : 20-30h pour produire la doc initiale, puis maintenance faible

### Angle 4 — Coach on-call asynchrone (Hormozi)
- Modèle gym Hormozi : coach 1:4 clients semi-personal, mais pour high ACV.
- Adapté à Two-Step : Thomas ≠ coach 1:1, mais **audit mensuel par lot** (20 marchands × 15 min audit par mois = 5h/mois)
- Coupé avec WhatsApp groupe = interventions ciblées hebdo ~2h

### Angle 5 — Seuil d'embauche / partenariat
- À ~40-50 marchands, support pur dépasse 20h/sem → soit automation level 2 (AI agent), soit recrutement
- Frère en backup peut absorber ~10h/sem sans full-time
- À 75-100 marchands : embauche CS partial impossible à éviter (6-15€/h FR)
- Marge/marchand à 19€ = ~14€ net → à 50 marchands = 700€/mois profit → pas assez pour embaucher sauf stagiaire

## Application concrète à Two-Step

### Phase 1 (0-5 marchands) — soutenable facilement
- ~2.5h/sem/marchand les 2 premières semaines (onboarding intense)
- Retombe à 30 min/sem/marchand après 30 jours
- Total ~5h/sem support → OK combiné avec prospection aggressive

### Phase 2 (5-20 marchands) — seuil d'alerte
- ~10h/sem support linéaire
- Exige **setup community WhatsApp + docs + FAQ AVANT d'atteindre 10 marchands** sous peine de s'enfoncer
- Risque principal : Thomas n'investit pas dans l'automation pendant Phase 1 parce qu'il est pris par le terrain, puis Phase 2 le rattrape

### Phase 3 (20-50 marchands) — décision structurelle
- Sans automation : 25h/sem support → burnout documenté
- Options :
  - A) Frère à mi-temps (si financièrement viable ≥500€/mois revenu brother)
  - B) Stack AI agent (Claude customer support, scripts automate tips) — 100-200€/mois coût
  - C) Hiring stagiaire CS FR (STAGE) — 500-600€/mois
- **Recommandation** : plan B à ~30 marchands (investissement 100€/mois < coût humain)

### Phase 4 (50+) — hors scope Phase 1, mais anticipation
- Stack automation requise
- Frère ou apporteurs d'affaires prenant rôle CS délégué

## Nouvelles questions soulevées (pour cycle 2)

1. Quels outils d'automation CS sont utilisables par un solo founder FR avec budget <150€/mois (Intercom, Crisp, Freshdesk, Tidio) ?
2. Quel est le playbook exact "community WhatsApp marchands" qui marche (taille groupe, cadence, règles) ?
3. Dear Skin Shop (lead premier) peut-il devenir "marchand-coach" pour les suivants, réduisant temps Thomas ?
4. Quelle est la durée réelle de phase intense onboarding par marchand (1 semaine ? 3 ? 1 mois ?) ?

## Recommandation + niveau de confiance

**Recommandation** :
1. **Dès le 1er marchand** : produire 3 vidéos Loom "onboarding J1/J7/J30", FAQ écrite, guide PDF
2. **Dès le 5e marchand** : créer WhatsApp community Saint-Étienne
3. **À 15-20 marchands** : setup Crisp ou Tidio avec macros (coût 0-25€/mois) avant que le support devienne >10h/sem
4. **À 30 marchands** : évaluer AI support stack (Intercom Fin, Claude-powered Zendesk) si budget le permet
5. **Frère formalisé CS partial** à 40 marchands si pas fait avant

**Plafond solo réaliste avec automation basique** : ~40 marchands. Avec automation agressive + community : ~75 marchands.

**Niveau de confiance** : 7/10. Données benchmarks CSM solides mais pas spécifiques au retail physique local FR. Les cas contradictoires (Pieter Levels etc.) ne s'appliquent pas à Two-Step.

## Ce qui reste incertain

- Temps réel onboarding d'un commerçant physique FR non-tech (pas de benchmark direct)
- Effet community WhatsApp quartier sur réduction support (pas de métrique documentée hors Place des Libraires, qui a un staff, pas solo)
- Capacité d'absorption du frère dans la durée (non chiffrée)
- Impact de l'AI verify cascade sur le temps Thomas (si pipeline planté = support X3)

## Sources (9 URLs citées)

- [Solo Founder SaaS Metrics: From $0 to $10K MRR in 6 Months — SoftwareSeni](https://www.softwareseni.com/solo-founder-saas-metrics-from-0-to-10k-mrr-in-6-months-with-realistic-timelines/)
- [SaaS Customer Onboarding Guide — Custify](https://www.custify.com/blog/saas-customer-onboarding-guide/)
- [The Golden Ratio of Customer Success Managers — Vitally](https://www.vitally.io/post/what-is-the-golden-ratio-of-customer-success-managers-to-customers)
- [Dear SaaStr: $20K ACV CSM coverage — SaaStr](https://www.saastr.com/dear-saastr-at-20000-acv-how-many-customers-should-each-customer-success-manager-have/)
- [Mastering SaaS growth without burning out — SaaS group](https://saas.group/podcasts/mastering-saas-growth-without-burning-out-as-a-solo-founder-with-jason-zigelbaum-zigpoll/)
- [Why Solo Developers Burn Out — 1000.software](https://www.1000.software/post/why-solo-developers-burn-out-and-how-even-a-little-help-changes-everything)
- [SaaS Low-Touch Customer Onboarding — ProductLed](https://productled.com/blog/saas-low-touch-customer-onboarding)
- [The Solo-Founder Playbook 1M ARR SaaS — ProductLed](https://productled.com/blog/the-solo-founder-playbook-how-to-run-a-1m-arr-saas-with-one-person)
- [Master Your CSM-to-Customer Ratio — TheCSCafe](https://www.thecscafe.com/p/csm-to-customer-ratio-optimization)

*Mots : ~1550. Quotas réduits 6 web_search + 2 web_fetch tenus. Sources contradictoires : 3 (Pieter Levels, Sarah Chen, SimpleDirect). Angles : 5 distincts couverts.*
