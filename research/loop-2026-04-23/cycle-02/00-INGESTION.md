# Cycle 02 — Ingestion (légère, basée sur cycle 01)

*2026-04-23 ~02:40 CET. Mode condensé : pas de ré-extraction Nexus/codebase, je m'appuie sur l'ingestion du cycle 01 + les seeds + l'auto-critique. ~600 mots.*

## État enrichi après cycle 01

### 3 insights hérités (à ne pas redémontrer)

1. Plafond solo ~40 marchands — investir automation dès 10 marchands
2. Google LFP reste canal dominant intent-search FR 35+, TikTok/Insta pour <25 ans — segmenter pitch par âge client
3. FLL auto (Feb 2026) pourrait simplifier roadmap LFP — **à tester**

### Seeds cycle 2 sélectionnées

Rééquilibrage technique obligatoire détecté cycle 1 :

- **S7** — Test SERP Google direct pour valider FLL auto
- **S15** — Rate limits Groq free tier en enrichment burst
- **S9** — Coût CPC LIA France 2026 pour sneakers/mode
- **S4** — Meta Catalog / Instagram Shopping API feed syndication
- **S2** — Playbook WhatsApp community B2B retail local

## Contexte technique à préciser avant les Q

### Sur S7 (test SERP direct)
Je ne peux pas ouvrir Chrome dans la nuit pour une query Google réelle. Je vais simuler via WebSearch de type "site:google.com products nearby query" ou équivalent. **Limite honnête** : ce n'est pas un vrai test SERP mais le meilleur approximation accessible.

### Sur S15 (Groq rate limits)
Je peux consulter directement la doc Groq publique + tester via WebFetch. Objectif : connaître les limites réelles free tier pour évaluer si un bootstrap Two-Step 30 produits sature ou pas.

### Sur S9 (CPC LIA FR)
Data Google Ads Keyword Planner nécessite compte connecté — je ne peux pas. Benchmarks secondaires via agences (Delante, Tinuiti, Feedonomics) suffiront comme estimation.

### Sur S4 (Meta Catalog feed)
Doc Meta for Developers publique + tutos marchands. Objectif : faisabilité implémentation roadmap 2027 Two-Step.

### Sur S2 (WhatsApp community playbook)
Recherche articles opérationnels (community building SaaS, Slack vs WhatsApp communities, gouvernance).

## Angles morts restants après cycle 01 (à surveiller)

- Décrémentation stock sans POS — non traité
- Coût CPC LIA FR — sera traité cycle 2 ✓
- Subventions CCI/France Num — report possible cycle 3
- Taux no-show commerce de proximité FR — report possible cycle 3
- Data FR locale shopping behavior par âge — report cycle 3 ou interviews terrain

## Plan cycle 2

- Ingestion rapide ✓ (ce doc)
- Pas de nouvelle génération de 20 Q — les 5 seeds sont directement les questions retenues
- Recherches condensées : 3-4 web_search + 0-1 fetch par Q (plus serré qu'en cycle 1)
- Objectif wall-clock : ~1h

Cycle 2 vise qualité technique au lieu de volume.
