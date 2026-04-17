# Google LFP Onboarding — Preparation dossier

*Date : 2026-04-18*
*Statut : En attente de contact Google (1-3 jours ouvres)*
*Ticket Google : 5-9519000040422 / 6-7242000040976*
*Merchant Center ID : 5755722759*

---

## One-pager Two-Step (English — for Google)

### Two-Step — Local Inventory Data Provider for Independent Retailers in France

**What we do:**
Two-Step aggregates product inventory data from independent brick-and-mortar shops and makes it available to consumers searching for products nearby. We connect to merchants' POS systems, extract catalog and stock data, enrich it with GTINs and product photos, and maintain real-time inventory accuracy.

**Market opportunity:**
France has 300,000+ independent retail shops. There is currently NO dedicated French LFP provider serving independent retailers. Existing LFP partners in France (dbaPlatform, NearSt, Shopify) focus on chains or specific verticals. Two-Step fills this gap.

**Technical capabilities:**
- POS integrations: Square, Shopify, Lightspeed, Zettle (API + webhooks)
- Universal CSV/Excel import for non-connected POS
- Invoice email parsing (automatic product catalog extraction)
- EAN/GTIN enrichment: 4-source cascade (EAN-Search, Open*Facts, UPCitemdb, reverse search)
- Real-time stock updates via POS webhooks
- Daily inventory feed generation in Google Local Product Inventory format
- Google Merchant Center API (OAuth configured, MCA-ready)

**Current status:**
- Platform live at twostep.fr
- Merchant Center account active (ID: 5755722759)
- Feed generation module built and tested
- Launching in Toulouse, France — pipeline of 30 independent retailers
- Targeting: fashion, sneakers, jewelry, cosmetics, eyewear, sports

**Pilot plan for LFP:**
- 5 pilot merchants selected for in-store inventory verification
- All pilot merchants: 50+ branded products with EAN barcodes, verified Google Business Profile
- Commitment: daily inventory updates minimum, real-time for POS-connected merchants
- Goal: achieve Trusted status within 8 weeks of approval

**Why Two-Step for Google:**
- First dedicated French LFP provider for independent retailers
- Deep POS integration (not just CSV uploads)
- Automated GTIN enrichment ensures high data quality
- Local presence in France — we know the market, the merchants, the POS landscape
- Scalable: same technical infrastructure serves 10 or 10,000 merchants

**Contact:**
Thomas Bauland — Founder
contact@twostep.fr
twostep.fr

---

## Script de reponses — Chaque question possible

### "Tell us about Two-Step"
"Two-Step is a SaaS platform that connects to independent retailers' point-of-sale systems to aggregate their product inventory data. We make this data available to consumers searching for products nearby. We're launching in Toulouse, France, with a pipeline of 30 independent retailers across fashion, jewelry, cosmetics, and sports. Our goal with the LFP program is to bring these retailers' inventory to Google Shopping and Google Maps."

### "How many merchants do you currently have?"
"We're in our launch phase in Toulouse. We have our first merchant onboarding this week and a confirmed pipeline of 30 boutiques in Toulouse's city center — Carmes, Saint-Etienne, Capitole districts. We've done field visits and have verbal commitments from several shop owners. Our target is 50 merchants within 3 months."

### "What types of retailers do you serve?"
"Independent brick-and-mortar shops selling branded products — fashion, sneakers, jewelry, cosmetics, eyewear, sports equipment, home decor. We specifically target shops that carry branded products with EAN barcodes, which ensures high GTIN coverage for Google's matching."

### "What percentage of products have GTINs?"
"We estimate 70-80% GTIN coverage across our target merchants. We have a 4-source EAN enrichment pipeline that automatically identifies GTINs for branded products. We also validate and cross-reference barcodes to ensure data accuracy. Products without GTINs are enriched with brand + MPN + detailed titles as fallback signals."

### "How do you get inventory data from merchants?"
"Three channels: direct API integration with major POS systems — Square, Shopify, Lightspeed, and Zettle — which gives us real-time webhook updates on every sale and restock. For merchants without connected POS, we support universal CSV/Excel import. And we have an automated invoice parsing system that extracts product data from supplier invoices forwarded by email."

### "How often can you update inventory?"
"POS-connected merchants: real-time updates via webhooks on every transaction. CSV merchants: daily updates minimum. We commit to at least daily inventory refresh for all merchants in the LFP program."

### "Do your merchants have Google Business Profiles?"
"Yes, it's a prerequisite in our onboarding process. We verify that each merchant has a verified Google Business Profile before enrolling them in the LFP program. If a merchant hasn't claimed their profile yet, we guide them through the process."

### "Are you technically ready for the Merchant API?"
"Yes. We have an active Merchant Center account — ID 5755722759 — with OAuth configured. We've built a feed generation module that produces Local Product Inventory feeds in the required format. We're ready to set up the Multi-Client Account structure and begin submitting data as soon as we're approved."

### "Can you provide 5 merchants for in-store verification?"
"Absolutely. We're selecting our 5 pilot merchants specifically for this purpose — shops with 50+ branded products, high EAN coverage, and verified Google Business Profiles. We'll coordinate the verification process with each merchant."

### "How do you handle merchant authorization?"
"Each merchant signs a partnership agreement during onboarding that explicitly authorizes Two-Step to submit their product and inventory data to Google Shopping. This is integrated into our terms of service."

### "What's your geographic coverage?"
"We're starting in Toulouse, France's 4th largest city. Our plan is to expand to other major French cities — Lyon, Bordeaux, Marseille, Nantes — once we've proven the model in Toulouse. The technical infrastructure is city-agnostic."

### "What's your business model?"
"Simple monthly subscription: 19 euros per month per merchant. No commission on sales, no transaction fees. The merchant pays for visibility, not per click or per order."

### "Why should we approve Two-Step?"
"Three reasons: First, there's no dedicated French LFP provider for independent retailers — we fill a real gap in Google's coverage. Second, we have deep POS integration, not just CSV uploads — this means higher data quality and freshness. Third, we're locally embedded — we know the French retail market, the POS landscape, and we're doing door-to-door merchant recruitment. This combination of local presence and technical depth is exactly what the LFP program needs in France."

### Questions a POSER a Google
- "What's the typical timeline from onboarding approval to Trusted status?"
- "For in-store inventory verification, does Google send someone to the store or is it a remote process?"
- "Is there a minimum number of merchants required before we can start submitting feeds?"
- "Can we start with Free Local Listings and add Local Inventory Ads later when merchants are ready?"
- "Is there a dedicated partner manager for the French market we can work with?"

---

## Checklist pre-appel

- [ ] Relire ce document
- [ ] Verifier Merchant Center (merchants.google.com) — infos a jour
- [ ] Avoir 2-3 noms de marchands "pipeline" a citer si demande
- [ ] Avoir le numero de ticket Google sous les yeux (5-9519000040422)
- [ ] Si appel : ouvrir ce document sur l'ecran pour lire les reponses
- [ ] Si email : copier-coller les reponses adaptees

---

## Infos techniques cles (pour reference rapide)

| Donnee | Valeur |
|---|---|
| Merchant Center ID | 5755722759 |
| Ticket Google | 5-9519000040422 |
| Site | twostep.fr |
| Region | FR |
| Langue | fr |
| Devise | EUR |
| POS supportes | Square, Shopify, Lightspeed, Zettle, Clictill, Fastmag |
| Format feed | Local Product Inventory (gtin, availability, price, store_code, timestamp) |
| Frequence updates | Temps reel (POS) / quotidien (CSV) |
| Seuil par marchand | 11 produits avec GTIN (LFP) vs 50 (self-service) |
| Verification Trusted | 5 marchands, ~2h chacun |
