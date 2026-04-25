# Q19 — Prévalence d'affichage feed LFP vs Shopping classique pour consos FR 2026

*Quotas : 4 web_search + 0 web_fetch (data-points suffisants dans search results). Confidence finale : 7/10.*

## Hypothèse de départ (écrite AVANT recherche)

*Le feed LFP / Free Local Listings apparaît AVANT les résultats Shopping classiques pour un user FR qui cherche "Nike Air Force 1 Toulouse", SI le marchand est ≤5km ET stock dispo ET statut Trusted → bloc "produits à proximité" en haut de SERP.*

## Findings bruts

### La mécanique réelle LFP vs LIA vs Shopping classique

**3 mécanismes différents coexistent en 2026** :

| Nom | Type | Coût marchand | Placement SERP |
|---|---|---|---|
| **Free Local Listings** (FLL) | Organique gratuit | 0€ | Onglet "Products"/"Shopping", bloc "In Stores Nearby", onglet Nearby, Maps |
| **Local Inventory Ads** (LIA) | Payant (Google Ads) | CPC/budget | Top SERP, entre résultats organiques, dans Maps, Images, Assistant |
| **Shopping classique** | Organique + Paid mixte | Variable | Grille produits, onglet Shopping standard |

**Note importante pour Two-Step** : la distinction **LFP (Local Feed Partner) ≠ LIA**. LFP est le programme pour les **prestataires** qui aident les marchands à alimenter ces feeds. Two-Step veut être **LFP Trusted** pour aider ses marchands à apparaître dans FLL (organique) et LIA (si le marchand veut payer).

### Disponibilité LIA/FLL en France

- ✅ France listée comme pays supporté par LIA + FLL
- ✅ Merchant Center FR actif 5755722759 (Two-Step)
- ✅ Toulouse/Saint-Étienne = zones où Google a data POI suffisante

### Prévalence du bloc "Produits à proximité" (Popular Products, In Stores Nearby)

**Data 2025-2026** :
- **+36% YoY** croissance du bloc "Popular Products" 2024→2026
- **14% des searches mobiles** affichent des product grids (2025)
- **>45% des searches mobiles product-focused** affichent product grids
- **12% des desktop** searches affichent des product grids
- **-11 à -23 pts** click share organique traditionnel 2025→2026 selon vertical (headphones -23 pts)
- **2.5 scrolls mobile pour atteindre le #1 organique**

**Conclusion prévalence** : pour une query commerciale (ex: "Nike Air Force 1 Toulouse"), la probabilité d'avoir un bloc Local Shopping / Products Nearby **en HAUT du SERP** est **très élevée** (probablement >60% sur mobile). Le résultat web organique classique (site boutique, Two-Step vitrine, etc.) recule.

### Trigger du bloc "Nearby"

- Le bloc Shopping Nearby apparaît **même SANS modifier "near me"** si Google détecte que l'intent est local (catégorie produit + géolocalisation user + presence de feed merchant local dans la zone)
- Si Google n'a pas de confidence sur la présence d'inventaire local → le bloc ne s'affiche pas

**→ Le feed LFP Two-Step est critique pour activer cet affichage sur les produits des marchands partenaires.**

### Facteurs ranking LIA/FLL

1. **Merchant feeds qualité** : GTIN accurate, images HTTPS, availability temps réel
2. **Shipping Score** (surtout pour Shopping classique)
3. **Prix competitif**
4. **Reviews / site authority** (facteur traditionnel)
5. **Accurate Google Business Profile** liée au Merchant Center

**Point critique** : *"Google relying on the most up-to-date information from Google merchants"* — **staleness du stock = deranking**. Le fait que Two-Step synchro CSV ou POS en temps réel est un **différenciateur majeur** vs des marchands qui uploadent CSV manuellement 1x/semaine.

### Free Local Listings en 2026 — simplification

Information février 2026 : *"With Google's automated approach, you don't need a separate local inventory feed. Google uses your existing online product data source plus signals from your website to power the local display."*

**Implication énorme pour Two-Step** : depuis début 2026, **Google peut automatiquement utiliser le feed Two-Step standard (productInputs) + les signaux de localisation** pour alimenter le Free Local Listings. Plus besoin d'implémenter la Voie B (lfpInventories:insert) en priorité absolue pour apparaître dans FLL.

**Cette info peut changer la stratégie Two-Step** : Voie A + Google Business Profile lié = peut-être suffisant pour FLL, Voie B devient optionnelle pour LIA payant seulement.

## 5 angles

### Angle 1 — FLL suffisant vs Voie B requis ?
Si FLL marche avec Voie A + GBP connecté → Two-Step peut livrer de la valeur "Google Free Shopping local" dès le 1er marchand connecté, sans implémenter Voie B. **À vérifier via test réel** avec Sole Store seed demain.

### Angle 2 — La compétition à Toulouse
Sur "Nike AF1 Toulouse", quels marchands apparaissent déjà en FLL aujourd'hui ?
- Citadium, Foot Locker, Courir = marchands nationaux avec feeds LIA pro probables
- Indépendants locaux = quasi absents (zero feed)
- **Opportunité Two-Step** : être la seule infra qui met les indépendants dans ce bloc.

### Angle 3 — Démographie du bloc Nearby par vertical
- **Mode/chaussures** : >50% SERP mobile affiche product grid
- **Skincare/cosmétique** : ~45%
- **Bijouterie artisanale** : probablement <20% (Google identifie moins bien la taxonomie)
- **Librairies** : <20% (catégorie peu produit)

Two-Step doit donc **prioriser les catégories à fort display rate** pour le premier pilote.

### Angle 4 — Effet AI Overview (Gemini)
En 2026 Google intègre Gemini dans SERP (AI Overview) qui peut **résumer les produits locaux dans une réponse textuelle**. Ça peut **renforcer** la visibilité Two-Step si Gemini pioche dans FLL, ou la **réduire** si Gemini préfère l'autorité des marketplaces (Amazon, Cdiscount).

### Angle 5 — Risque d'invisibilité malgré tout
Un marchand Two-Step Trusted LFP pourrait quand même **ne pas apparaître** si :
- Feed mal synchronisé (stock périmé >24h)
- Catégorie peu disputée
- GBP mal configuré côté marchand
- Concurrent avec plus d'autorité web

**→ Thomas doit intégrer "GBP check" dans l'onboarding marchand.**

## Application Two-Step

### Décisions

1. **Voie A Merchant API + FLL automatique** : priorité absolue. Demande moins d'implémentation que Voie B.
2. **Reporter Voie B LFP (lfpInventories:insert) en Phase 2** seulement si FLL auto ne marche pas en test réel avec Sole Store.
3. **Demander activation Voie B seulement si nécessaire** auprès du specialist Google (ça simplifie la conversation : "on teste FLL auto d'abord, on vous dit").
4. **Ajouter un check GBP à l'onboarding** — chaque marchand doit avoir un GBP vérifié lié au Merchant Center sub-account.
5. **Prioriser catégories à display rate élevé** : sneakers, mode, skincare en priorité pour démontrer la valeur vite.

### Pitch ajusté

Au lieu de *"nous intégrons votre boutique dans Google LFP"* → dire *"votre stock apparaît gratuitement dans Google Shopping Local, dans Maps, dans le bloc 'Produits à proximité'. Sans Ads, sans commission."*

Plus concret pour un boutiquier.

## Nouvelles questions soulevées

1. **Test réel** : faire une search "produit-de-Sole-Store Toulouse" sur Google mobile demain, voir si la vitrine apparaît dans FLL (test avec un produit du seed).
2. **Voie B vs Voie A différence pour LIA payant** — si un marchand veut bid pour top placement, quelle voie utiliser ?
3. **Feeds FLL et AI Overview Gemini** : est-ce que Gemini puise dans les FLL pour les recommandations produits ?
4. **Coût CPC moyen LIA France 2026** pour une cat "sneakers" dans un quartier Toulouse ?
5. **Impact de Google Business Profile non vérifié sur la visibilité FLL** — exigence ou nice-to-have ?

## Recommandation + confiance

**Recommandation** :
- **Simplifier la roadmap LFP** : Voie A + FLL auto (config GMC gratuite) comme target Phase 1. Pas d'implémentation Voie B avant test FLL auto.
- **Ajouter au dossier specialist Google** : demande clarification sur FLL auto (*"doit-on implémenter Voie B ou FLL auto suffit pour nos marchands ?"*)
- **Onboarding marchand** doit inclure : check GBP existant OU aide création GBP
- **Prioriser pilotes en catégories "fort display"** : sneakers, skincare, mode

**Confidence** : 7/10. Data Google assez solide, mais la vraie prévalence FR spécifique (pas US) reste à tester par query réelle — je n'ai pas fait de test SERP direct cette nuit.

## Ce qui reste incertain

- Prévalence exacte FR bloc Nearby pour query précise (test direct requis)
- Date exacte où FLL auto a remplacé le besoin de feed local dédié (février 2026 selon la source, à confirmer)
- Impact qualité feed Two-Step vs feed agrégateurs concurrents nationaux (Amazon, Zalando pivot vers local ?)
- Priorité LFP Trusted obligatoire pour FLL auto ou pas

## Sources (7 URLs)

- [Google Local Inventory Ads (LIA) — Delante](https://delante.co/google-local-inventory-ads-lia/)
- [Google LIA — Lengow Help](https://help.lengow.com/hc/en-us/articles/360016275452-Google-LIA-Local-Inventory-Ads)
- [Local inventory ads and free local listings overview — Google Merchant Center Help](https://support.google.com/merchants/answer/14615117?hl=en)
- [Free Local Listing Changes — FeedSpark](https://feedspark.com/feed-management-blog/google-free-local-listings)
- [Google SERP Features: Understanding Modern Search 2026 — GrowByData](https://growbydata.com/google-serp-features/)
- [Google SERP Remonetization 2025-2026 — ALM Corp](https://almcorp.com/blog/google-serp-remonetization-organic-decline-paid-ads-growth-2025-2026-data-analysis/)
- [Google boosting visibility of 'nearby' product inventory — Search Engine Land](https://searchengineland.com/google-boosting-visibility-of-nearby-product-inventory-with-new-shopping-features-340670)

*Mots : ~1700. Quotas réduits 4 web_search + 0 fetch (data dense dans searches, fetch pas nécessaire). Sources contradictoires : au moins 1 (Free Local Listings automatique = bypass feed dédié).*
