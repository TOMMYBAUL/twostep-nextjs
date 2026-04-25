# S4 — Meta Catalog / Instagram Shopping feed syndication pour Two-Step

*Quotas : 1 web_search. Confidence 7/10.*

## Findings

### Meta ecosystem — portée massive
- Meta (Facebook + Instagram + WhatsApp) : 3 milliards d'utilisateurs/mois
- **Instagram Shopping : 130 millions d'interactions produit/mois**
- Facebook Shops en croissance

### Comment intégrer un feed dans Meta Catalog

1. **Meta Business Extension (MBE)** — recommandé pour e-commerce platforms (Shopify, BigCommerce, WooCommerce)
2. **Meta Catalog API direct** — accès programmatique pour custom build
3. **Third-party tools** : Foursixty, Channable, GoDataFeed pour UGC/shoppable posts

### Format feed requis

- Inventaire + descriptions + prix + images + URLs en temps réel
- Format proche Google Shopping (CSV/XML avec GTIN, title, availability, price)
- Domain Verification obligatoire depuis 2026 (anti-spoofing)

### Implication Two-Step — possibilité d'integration

**Oui, Two-Step peut implémenter un second cron `/api/cron/meta-feed`** qui consomme la même DB enrichie et pousse vers Meta Catalog API.

**Effort estimé** :
- Implementation initial : 3-5 jours tech (auth Meta, feed XML, Catalog API calls, tests)
- Maintenance : faible si format stable (comme Google Shopping)
- Domain Verification : friction d'onboarding supplémentaire pour chaque marchand (ils doivent vérifier leur domaine via Meta Business)

## Application Two-Step

### Quand l'envisager

**Pas Phase 1** — Google LFP suffit pour démontrer valeur + démographie FR âge médian favorise Google.

**Phase 2 (50+ marchands)** — option "multi-canal" :
- Feed Google LFP (gratuit)
- Feed Meta Catalog (gratuit pour Facebook/Insta Shops)
- Pitch : *"Vos produits visibles sur Google ET Instagram Shopping, automatiquement"*

**Phase 3** — Advantage+ ads Meta (paid) pour les marchands qui veulent booster.

### Friction à anticiper

1. **Domain Verification Meta** = chaque marchand doit avoir un domaine vérifié. Si marchand n'a pas de site, **Two-Step doit gérer ça** (sous-domaine twostep.fr/boutique-X).
2. **Compte Meta Business** — chaque marchand doit en avoir un. Beaucoup n'ont que Instagram perso.
3. **Catalog review Meta** — comme Google, il y a une review. Temps typique 2-7 jours.

### Insight stratégique

Implémenter Meta Catalog feed = **Two-Step devient canal-agnostique**. Ça :
1. Dilue le risque "Google ralentit"
2. Ouvre la découverte Gen Z (via Instagram)
3. Renforce le pitch multi-canal

**Idée** : dès Phase 2, le slogan devient *"Un catalogue, toutes les vitrines numériques — Google, Instagram, TikTok (roadmap)."*

## Recommandations

1. **Ne PAS implémenter en Phase 1** — distraction
2. **Garder l'architecture feed modulaire** — quand on fait `/api/cron/google-feed`, s'assurer que le code `transformProductToGoogle` peut être dupliqué facilement en `transformProductToMeta`
3. **Phase 2** : implémenter comme add-on après 20+ marchands — démontrer valeur Google d'abord
4. **Phase 3** : évaluer TikTok Shop API (lancement FR 2025-03-31)
5. **Veille** : s'abonner aux newsletters Meta for Developers pour changes API

## Confidence : 7/10

Meta Catalog API est bien documentée. Le questionnement technique est faisable. L'incertitude est sur l'impact business (les marchands vont-ils vraiment valoriser Instagram Shopping en plus de Google ?).

## Sources

- [Meta Catalog Feed Guide 2026 — AIShoppingFeeds](https://www.aishoppingfeeds.com/blog/meta-catalog-feed-facebook-instagram/)
- [Instagram Shopping Integrations — Foursixty](https://foursixty.com/blog/instagram-shopping-integrations/)
- [Facebook Product Feed Specifications 2026 — AdNabu](https://blog.adnabu.com/facebook/facebook-product-feed-specifications/)
- [Instagram Product Feed Complete Guide — Marpipe](https://www.marpipe.com/blog/instagram-product-feed-complete-guide-to-instagram-shopping-catalog-ads)
