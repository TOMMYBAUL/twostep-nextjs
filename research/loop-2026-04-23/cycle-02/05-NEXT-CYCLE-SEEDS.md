# Cycle 02 → Cycle 03 seeds

## 15 questions émergées

### Depuis S7 (test SERP)
**T1** — Panorama et The Last Step : ont-ils un site e-commerce ? Stack Shopify ? Quels POS ? (Prep prospection)
**T2** — Quelle est la vraie structure de la SERP Google FR 2026 pour une query "sneakers Toulouse" en Chrome mobile (product grid, Maps, FLL) ?

### Depuis S15 (Groq rate limits)
**T3** — BullMQ vs Upstash Redis Queue vs Supabase Queue : lequel est le meilleur pour Two-Step queue job enrichment ?
**T4** — Groq Dev tier 5$/mo — vaut-il vraiment le coût à 3-5 marchands ? Point de switch précis ?
**T5** — Anthropic Claude Haiku direct (hors cascade) : coût par produit enrichi vs Groq + hit rates ?

### Depuis S9 (CPC LIA FR)
**T6** — Benchmark CPC par sous-catégorie FR (sneakers high-end vs entry-level, bijouterie fantaisie vs précieuse) ?
**T7** — Google Partner program : Two-Step peut-il devenir Google Partner pour toucher commission sur LIA ads des marchands ?
**T8** — Pennylane/Tiime sponsorisent-ils les commerçants sur Google Ads (partenariat implicite possible) ?

### Depuis S4 (Meta Catalog)
**T9** — Meta Business Manager onboarding : combien de temps ça prend pour un commerçant sans compte existant ?
**T10** — Y a-t-il un partenariat possible avec Shopify (ou Square) pour que Two-Step apparaisse nativement dans leur catalog → Meta pipe ?

### Depuis S2 (WhatsApp community)
**T11** — Place des Libraires a-t-elle un groupe WhatsApp/Discord marchands ? Modèle à copier ?
**T12** — Hormozi community playbook pour gym — a-t-il un équivalent "retailer community" documenté ?

### Techniques trous cycle 02
**T13** — RLS Supabase : toutes les tables ont-elles les bonnes policies ou certaines sont-elles ouvertes par défaut ?
**T14** — Webhook HMAC : bien implémenté partout ? Stripe, Square, Shopify ?
**T15** — Data leak risk : quelles données cross-marchand pourraient fuiter (ean_lookups partagé = OK, mais prix de vente ou stock perso = pas OK) ?

## Priorisation cycle 03

Top 5 à creuser :

1. **T2** (test SERP structure détaillée) — encore la Q #1 non résolue proprement
2. **T3** (queue tech choice) — à décider rapidement avant d'avoir 5 marchands CSV
3. **T13** (RLS audit) — sécurité avant signing 1er marchand réel
4. **T11** (Place des Libraires community) — enseignement direct du modèle de référence
5. **T6** (CPC par sous-catégorie) — affine le pitch GSM

## Meta observations

- Cycle 02 a pivoté vers le technique comme prévu. Il reste à couvrir la **sécurité** (RLS, HMAC, leaks) qui est un trou.
- **Question structurelle** qui émerge : Two-Step a-t-il pensé à une stratégie "Google Partner" (commission ads) comme source de revenus secondaire ?
- Les "leads cachés" (Panorama, TLS) sont un cadeau du cycle 02 — Thomas doit exploiter ça lundi.
