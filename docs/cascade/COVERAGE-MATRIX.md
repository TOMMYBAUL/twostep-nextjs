# Cascade enrichissement — matrice de couverture (référence vivante)

> Source de vérité : brain `06-Tech/Socle-identification-cascade.md` (4 vecteurs × 6 tiers).
> Mise à jour : 2026-04-25 — cycle 0 initial.
>
> **Objectif** : pour chaque cas d'usage réel observé chez un marchand, savoir si
> la pipeline actuelle peut le résoudre avec un score `≥ 0.95` (publish auto),
> `0.70-0.95` (queue review), ou `< 0.70` (masked).
>
> **Mode d'utilisation** : Claude consulte ce fichier à chaque cycle pour vérifier
> qu'aucun cas n'est "supposé résolu". Tout cas non testé E2E reste flag `?`.

## Légende statuts

| Symbole | Sens |
|---|---|
| ✅ | Géré + testé (unit ou E2E ou observé en prod) |
| 🟡 | Géré en théorie, **pas testé en réalité** — supposition à valider |
| 🟠 | Partiellement géré (ex : cascade trouve mais score faible → queue review obligatoire) |
| ❌ | Pas géré — input passe en queue ou produit faux positif |
| 🔵 | Hors scope V1 (à différer) |

## A. Inputs par CANAL

### A1. Export CSV/Excel marchand

| # | Cas | Tier(s) théorique | Status | Note |
|---|---|---|---|---|
| A1.1 | CSV propre Square FR (header standard, EAN colonne `Barcode`) | 2 + 6 | 🟡 | Square non testé, seuls Lightspeed/Hiboutik avaient été audités |
| A1.2 | CSV Lightspeed FR header `Code-barres` | 2 + 6 | 🟡 | À tester |
| A1.3 | CSV Hiboutik export | 2 + 6 | 🟡 | API Hiboutik existante mais pas CSV testé |
| A1.4 | CSV Excel maison header `gencode` ou `EAN` ou `code` ou `UPC` | parser auto-détect | 🟠 | Auto-détection actuelle dérape → nom = description (bug observé 2026-04-25 sur 20 produits Two-Step Test) |
| A1.5 | CSV avec virgule prix `129,99` non-quotée (locale FR) | parser | ❌ | Décale toutes les colonnes → 1 ligne en moins ou décalage silencieux |
| A1.6 | CSV avec apostrophe Excel `'5449000000996` | normalize | ✅ | `normalizeIdentifier` strip `'` |
| A1.7 | CSV UTF-8 BOM | parser | 🟡 | papaparse gère le BOM, pas testé |
| A1.8 | CSV Windows-1252 (export Excel ancien) | parser | ❌ | Caractères accentués cassés → name="Bã©bã©" |
| A1.9 | CSV séparateur `;` (Excel FR) au lieu de `,` | parser | 🟡 | papaparse `delimiter` auto-detect, pas testé |
| A1.10 | CSV avec lignes vides en milieu | parser | ✅ | `skipEmptyLines: true` dans Papa.parse |
| A1.11 | CSV avec doublons EAN (variantes couleur ou taille) | grouping | 🟠 | `groupVariantsByEAN` existe mais grouping basé sur name+strip-size, pas EAN brut |
| A1.12 | CSV ligne avec virgule dans description quoted `"sweat noir, capuche"` | parser | ✅ | Papa parse respecte le quoting |
| A1.13 | CSV avec colonne `Photo URL` parsée comme `name` | mapping | ❌ | **Bug observé** — parser auto a mappé URL en `name` dans 1 ligne sur 20 |

### A2. POS API sync (premier sync = bootstrap)

| # | Cas | Tier(s) | Status | Note |
|---|---|---|---|---|
| A2.1 | Square API : item avec `gtin` + `upc` champs | 2 + 6 | 🟡 | Code existe (`src/lib/pos/square.ts`), bootstrap testé 30 produits le 2026-04-21 |
| A2.2 | Square sans gtin (saisie marchand `name="ARTICLE 42"`) | reverse search | 🟠 | `isNameRichEnoughForReverseSearch` blacklist `article` → SKIP → reste sans EAN |
| A2.3 | Shopify variant avec `barcode` mais pas `vendor` | 2 + 6 | 🟡 | Vendor=null, brand check coherence va rejeter peut-être trop |
| A2.4 | Lightspeed item avec `manufacturerSku` mais pas `customSku` | mapping | 🟡 | À tester |
| A2.5 | Zettle product sans EAN ni SKU | reverse search via name | 🟠 | Si name trop générique → skip |
| A2.6 | Hiboutik référence interne `R12345` (pas EAN) | reverse search | 🟠 | Code R12345 trop générique → skip |

### A3. Photo téléphone marchand (bootstrap manuel)

| # | Cas | Tier(s) | Status | Note |
|---|---|---|---|---|
| A3.1 | Photo HD produit fond blanc | 4 (CLIP) | 🔵 | CLIP non implémenté V1 (différé fin Phase) |
| A3.2 | Photo basse qualité, fond non blanc | 4 (CLIP) + rembg | 🔵 | rembg en place (Hetzner), CLIP différé |
| A3.3 | Photo de plusieurs produits ensemble | OCR + CLIP | 🔵 | Pas de détection multi-objet V1 |
| A3.4 | Photo sans le produit (étiquette seule) | OCR Vision | 🔵 | Claude Vision pas branché auto |

### A4. Forward email facture fournisseur

| # | Cas | Tier(s) | Status | Note |
|---|---|---|---|---|
| A4.1 | PDF facture standard (libellé + EAN + qté + prix) | parser PDF + 2/6 | 🟡 | Pipeline `src/lib/parser` existe, audit fini 2026-04-14 |
| A4.2 | Photo de facture papier (pas PDF) | OCR Vision | 🟡 | Claude Vision branché probablement, à vérifier |
| A4.3 | Email avec body texte sans pièce jointe | parser | ❌ | Pas testé |
| A4.4 | Facture multi-pages | parser | 🟡 | À tester |

### A5. Scan code-barres caisse / téléphone

| # | Cas | Tier(s) | Status | Note |
|---|---|---|---|---|
| A5.1 | Scan EAN-13 propre via app marchand | 1 + 2 | 🔵 | Wizard scan @zxing prévu Plan 04, pas codé |
| A5.2 | Scan UPC-12 (US) | 1 (UPC→EAN13 prefix 0) | ✅ | `upc12ToEan13` couvre |
| A5.3 | Scan code endommagé/illisible | OCR fallback | 🔵 | Pas V1 |
| A5.4 | Scan EAN-8 | 1 | ✅ | `isValidEan8` couvre |

### A6. Saisie manuelle dashboard

| # | Cas | Tier(s) | Status | Note |
|---|---|---|---|---|
| A6.1 | Marchand tape `name + EAN + prix` à la main | 1 + 2 | 🟡 | UI form existe |
| A6.2 | Marchand tape `name` seulement, pas EAN | reverse search | 🟠 | Si name riche → reverse, sinon skip |
| A6.3 | Marchand tape EAN mais avec faute (1 chiffre) | validators | ✅ | Checksum rejette → user alerted |

## B. PATHOLOGIES par CHAMP

### B1. EAN

| # | Pathologie | Géré ? | Note |
|---|---|---|---|
| B1.1 | EAN-13 propre + populaire (Coca, Nike, Lego) | ✅ | Tier 2 OPF/OBF cover OK |
| B1.2 | EAN-13 propre mais obscur (artisanat marque locale) | 🟠 | Tier 2 absent → Tier 6 EAN-Search peut-être → score 0.90 = queue |
| B1.3 | EAN-13 avec checksum cassé (`5449000000997`) | ✅ | `canonicalizeEan` retourne null → produit reste sans EAN |
| B1.4 | UPC-12 valide (US) | ✅ | `upc12ToEan13` |
| B1.5 | EAN-8 valide (petits produits) | ✅ | `isValidEan8` |
| B1.6 | EAN avec espaces `805 0597 14405 6` | ✅ | `normalizeIdentifier` strip |
| B1.7 | EAN avec apostrophe Excel `'5449000000996` | ✅ | strip |
| B1.8 | EAN avec lettres `123ABC456789X` | ✅ | rejeté à validation |
| B1.9 | EAN GTIN-14 (cartons/colis 14 chiffres) | ❌ | Notre regex `^\d{8,13}$` rejette 14 chiffres |
| B1.10 | EAN ISBN-13 préfixé 978/979 (livres) | 🟠 | détecté via `isValidIsbn13` mais Dilicom pas branché → fallback Tier 2 OPF/OBF non spécialisés livres |
| B1.11 | EAN CIP-13 préfixé 340 (médicaments FR) | 🟠 | détecté via `isValidCip13` mais BDPM pas branché → fallback Tier 6 EAN-Search peut-être |
| B1.12 | Doublon EAN dans même import (variantes taille/couleur) | 🟠 | groupVariants fait grouping mais peut écraser sur name différent |

### B2. Nom (`name`)

| # | Pathologie | Géré ? | Note |
|---|---|---|---|
| B2.1 | Nom propre `"Nike Air Force 1 White"` | ✅ | reverse search OK avec brand boost |
| B2.2 | Nom = description (`"Sneakers iconiques, semelle Air visible"`) | ❌ | reverse search trouve **ce qui ressemble**, AI verify peut être trompé |
| B2.3 | Nom = URL photo (`"https://cdn.example.com/..."`) | ❌ | **Bug observé** — devrait être détecté + rejeté |
| B2.4 | Nom = code SKU (`"R12345"`, `"ART-42"`) | ✅ | blacklist `article`, `produit`, `item`, `test`, `sku`, `ref` |
| B2.5 | Nom multilingue (FR+EN dans même catalogue) | 🟡 | reverse search dépend de la langue de la base externe |
| B2.6 | Nom tronqué `"Sweat à capuche tail..."` | 🟠 | tokens >= 2 chars, peut quand même reverse |
| B2.7 | Nom marque + désignation (`"Lacoste Polo"` sans modèle) | 🟠 | trop générique → AI verify peut accepter le mauvais Lacoste Polo |
| B2.8 | Nom 1 mot `"Ballerine"` | 🟠 | rejeté par `isNameRichEnoughForReverseSearch` (< 2 tokens) |
| B2.9 | Nom avec emoji ou caractères spéciaux `"Sweat 🔥 fire"` | 🟡 | normalize strip, devrait passer |

### B3. Marque (`brand`)

| # | Pathologie | Géré ? | Note |
|---|---|---|---|
| B3.1 | Brand explicite et cohérente avec name | ✅ | brand boost reverse search |
| B3.2 | Brand absente (champ null) | ✅ | reverse search sans brand fonctionne, score moins fort |
| B3.3 | Brand inventée par marchand (`"Crescent"` sur un produit Nike) | 🟠 | brand coherence check rejette si name ne contient pas la brand |
| B3.4 | Brand = nom marchand (boutique self-branded) | 🟡 | passera mais reverse search retourne probablement rien |

### B4. Photo URL

| # | Pathologie | Géré ? | Note |
|---|---|---|---|
| B4.1 | URL CDN public valide | ✅ | rehost R2 (cache-photo-r2.ts) |
| B4.2 | URL Google Drive privé (404 sans login) | ❌ | rehost échouera silencieusement |
| B4.3 | URL avec auth requise (Cloudflare R2 signed) | ❌ | rehost échouera |
| B4.4 | URL pointant vers un favicon ou logo (pas le produit) | ❌ | aucune validation visuelle V1 (CLIP différé) |
| B4.5 | URL .webp/.avif modernes | ✅ | rehost gère |
| B4.6 | Pas de photo + pas d'EAN | 🟠 | Serper image search par name+brand → qualité variable |

### B5. Prix / Stock / Tailles

| # | Pathologie | Géré ? | Note |
|---|---|---|---|
| B5.1 | Prix en € avec symbole `19,99 €` | 🟡 | parseInvoice extract numérique, à tester |
| B5.2 | Prix en centimes `1990` (Stripe-style) | 🟡 | Pas géré, peut interpréter comme 1990€ |
| B5.3 | Prix négatif (rétro-comptage) | ✅ | filter `quantity >= 0` dans catalog/import |
| B5.4 | Stock 0 (rupture) | ✅ | accepted, produit visible mais "épuisé" |
| B5.5 | Tailles `M`/`38`/`EU 38`/`T2` mêmes catalogue | 🟠 | extractSize détecte format unique, mix peut perdre |
| B5.6 | Pointures avec demi `42,5` | 🟡 | à vérifier |

## C. VERTICAUX MARCHANDS

### C1. Mode / Sneakers (cible Two-Step #1)

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C1.1 | Nike/Adidas/NB/Veja avec EAN propre | Tier 2 OBF/OPF + Tier 6 EAN-Search | ≥0.95 attendu (testable) |
| C1.2 | Marque indépendante locale Toulouse | Tier 6 EAN-Search seul | 0.90 → queue |
| C1.3 | Vintage sans EAN | Aucun tier sans CLIP | <0.70 → masked |

### C2. Cosmétique / Parfumerie

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C2.1 | Le Labo / Aesop / Tata Harper avec EAN | Tier 2 Open Beauty Facts | ≥0.95 attendu |
| C2.2 | Crème indé sans EAN | Aucun tier | <0.70 |

### C3. Lunetterie

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C3.1 | Ray-Ban / Persol avec EAN | Tier 6 EAN-Search | 0.90 = queue 🟠 |
| C3.2 | Solaires marque locale | Aucun | <0.70 |

### C4. Électronique / Audio

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C4.1 | Apple AirPods, Sony headphones avec EAN | Tier 2 Open Products Facts (Icecat-equivalent) + Tier 6 | ≥0.95 attendu |

### C5. Livres (vertical Place des Libraires — concurrence frontale, on évite)

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C5.1 | ISBN-13 livre standard FR | 🔵 Tier 1 Dilicom différé | ✗ — tomber sur Tier 6 |

### C6. Médicaments

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C6.1 | CIP-13 médicament FR | 🔵 Tier 1 BDPM gratuit pas branché V1 | 🟠 fallback Tier 6 |

### C7. Alimentaire / Vin / Bio

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C7.1 | Produit avec EAN (Nutella, Coca) | Open Food Facts pas branché ! Tier 6 quand même 🟠 | 0.90 |

### C8. Artisanat / Vintage / Customisé

| # | Cas | Couverture | Score attendu |
|---|---|---|---|
| C8.1 | Sans EAN sans photo | Aucun tier | <0.70 = masked, normal |
| C8.2 | Avec photo HD seulement | 🔵 Tier 4 CLIP | différé |

## D. UTILITÉS RÉELLES — à quoi sert vraiment cette pipeline

### D1. Pour le MARCHAND

- **D1.1** "Mes produits sont visibles sur Google Shopping" — exige score ≥ 0.95 (Google LFP n'accepte que des produits identifiés)
- **D1.2** "Je n'ai pas à saisir EAN/marque/photo manuellement" — automation des champs Tier 1-3
- **D1.3** "Pas de faux positif chez moi" (mon stock affiche un produit avec mauvais nom = catastrophe d'image)

### D2. Pour le CONSUMER

- **D2.1** Search "Nike Air Max 90" trouve l'AM90 du marchand local — exige cohérence canonical_name
- **D2.2** Photo affichée = bonne photo (pas un favicon, pas un produit différent)
- **D2.3** Disponibilité réelle (pas de produit fantôme en stock 0 affiché disponible)

### D3. Pour Two-Step (data + LFP)

- **D3.1** Pas de produit douteux dans le feed Google Merchant — sinon ban LFP
- **D3.2** Cache propriétaire `ean_lookups` enrichi à chaque import (réduit coûts API au fil du temps)
- **D3.3** Données pour active learning Phase 5+ (Ditto + FashionCLIP custom)

## E. GAPS IDENTIFIÉS — cycle 0

Priorité par impact business (1=critique, 3=plus tard) :

### E1. Critique — bloque V1 production

1. **Validation checksum à l'entrée du POS sync + CSV** (cas A1.6, B1.3, B1.6-8) — actuellement `lookupEan` ne valide PAS le checksum, regex format seul. **Action** : utiliser `canonicalizeEan` partout AVANT lookup.
2. **Bug parser CSV qui prend description en `name`** (cas A1.13, B2.2-3) — bug observé 2026-04-25. **Action** : audit `parseInvoice` pour mapping colonnes explicite OU remplacer auto-detect par mapping marchand-confirmé dans wizard step 2.
3. **Pas de scoring par tier — résultat indifférencié** (toute la cascade) — `lookupEan` retourne "trouvé/pas trouvé" sans dire quel tier. **Action** : refactor pour tagger chaque résultat avec son tier source et combiner via `score-cascade`.
4. **Routing ISBN/CIP au Tier 1 sectoriel** (cas B1.10-11, C5, C6) — détection faite par `detectIdentifierType` mais pas branchée à Dilicom/BDPM. **Action** : Tier 1 CIP gratuit (BDPM api-medicaments.fr) à brancher (15 min). ISBN différé (concurrence Place des Libraires + 15€/mo).

### E2. Hautes — calibrer pour pilote Dear Skin/Kap

5. **EAN GTIN-14 (cartons fournisseur)** (cas B1.9) — regex étroite. **Action** : étendre `^\d{8}(\d{4,6})?$` ou détection longueur explicite.
6. **Photo URL Google Drive privé** (cas B4.2) — silencieux. **Action** : ajouter regex blacklist + warning dans queue review.
7. **Tailles mix `M`/`38` même catalogue** (cas B5.5) — extractSize fail. **Action** : tolérer 2 formats par produit (texte + numérique).

### E3. Moyennes — V1.5

8. **Multi-source voting** : actuellement la cascade s'arrête au 1er match. Idée : continuer à 1-2 autres tiers pour boost convergence. **Action** : refactor `fetchEanData` pour collecter 2-3 résultats au lieu de short-circuit.
9. **Open Food Facts** non branché (cas C7.1) — pour vendeurs épicerie/cave. **Action** : 1h dev, ajouter fonction `fetchFromOpenFoodFacts` + reverse.
10. **Google Product Catalog (Tier 3)** (toute la couche manquante) — auth Google déjà OK via Merchant Center. **Action** : 2-3h.

### E4. Différé Phase 2-3

11. **CLIP Tier 4** — différé Thomas (fait à la fin)
12. **BERT Tier 5** — Phase 4-5 active learning
13. **Dilicom Tier 1 livres** — quand marchand librairie signe
14. **OCR Vision sur photos étiquettes** (cas A3.4)

## F. PROCHAINS CYCLES — protocole

À chaque cycle :
1. **Cycle N1** : choisir 1 gap E1, l'implémenter avec tests, re-passer les cas concernés ici en `✅`
2. **Cycle N2** : re-relire cette matrice — détecter si le fix introduit nouveau gap
3. **Cycle N3** : rebrancher le code avec le score-cascade pour que tout consommateur (catalog/import, invoices/validate, wizard step 4, POS sync) bénéficie

**Critère de fin V1 honnête** : 80% des cas A1+A2+B1+B2+C1+C2+C4 passent en `✅` ou `🟠 acceptable queue`. Pas 100%.
**Le reste** (artisanat, vintage, multilingue avancé, photos OCR) reste 🔵 / 🟠 et est traité par UX queue review marchand 1-tap.

---

**Last updated** : 2026-04-25 cycle 0 (initialisation matrice).
