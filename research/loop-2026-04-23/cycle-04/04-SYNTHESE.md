# Cycle 04 — Synthèse

## Top 3 insights cycle 04

### Insight #9 — Webhook HMAC : 5 checks obligatoires Two-Step
**Confiance 7.5/10.** Stripe hex vs Shopify base64 vs Square base64+url — chaque provider a ses pièges. Raw body + timestamp tolerance + constant-time eq + idempotency = 4 checks critiques. Script de test automatique recommandé avant 1er marchand signé. *(Cycle 04 T14)*

### Insight #10 — Cascade AI verify = bonne stratégie, pas de switch Haiku direct
**Confiance 8/10.** Groq Llama 70B = ~3x moins cher que Haiku et suffit 90% des cas. Haiku en fallback "smart cascade" sur cases litigieux. Coût total Two-Step AI verify à 50 marchands actifs = 15-40$/mois. Acceptable. *(Cycle 04 T5)*

### Insight #11 — Subventions Occitanie à exploiter = levier pitch #4 budget
**Confiance 6.5/10.** Chèque numérique IDF fermé 2025-10-24, dispositifs régionaux variables. Occitanie probablement a un équivalent (Pass Occitanie Digital mentionné brain). Si trouvé → pitch *"19€/mois verrouillé + 1re année 0€ via CCI"* = transforme objection Budget. *(Cycle 04 S14)*

## Insight #12 bonus — Innovation community = différenciateur vs Place des Libraires
**Confiance 6/10.** Le modèle livre FR n'a pas de "WhatsApp community peer-to-peer" visible. Two-Step peut créer ce canal pour les commerces brandés = différenciateur produit, pas juste feature. *(Cycle 04 T11)*

## Insights cumulés sur 4 cycles : 12 (moyenne confiance 7.3/10)

## Décisions qui en découlent

1. **Script test webhooks automatisé** à écrire avant 1er marchand (lundi)
2. **Garder cascade AI verify actuelle** — pas de refactor prématuré
3. **Recherche subventions Occitanie** = action lundi matin Thomas
4. **Pitch community WhatsApp** comme avantage différenciant vs Place des Libraires
