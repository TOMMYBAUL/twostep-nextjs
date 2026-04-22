# Audit format `cron/google-feed` vs spec officielle Aftab

*Date : 2026-04-22*
*Source spec : email Aftab (gTech) ticket 5-9519000040422 + Google docs publiques*
*Files audités : `src/app/api/cron/google-feed/route.ts` + `src/lib/google/feed.ts`*

---

## Contexte

Le specialist Google va probablement valider le format de notre feed pendant le call. L'email d'Aftab donne explicitement les champs requis pour LFP. Ce rapport identifie ce qui est conforme, ce qui ne l'est pas, et ce qui manque.

**Distinction clé** :
- **Voie A (implémentée)** = `productInputs:insert` Merchant API — un produit par appel, par compte marchand.
- **Voie B (LFP, à implémenter)** = `lfp/v1/lfpInventories:insert`, `lfpStores:insert`, `lfpSales:insert` — endpoints différents, format différent.

L'audit ci-dessous porte sur **Voie A** (le code actuel). **Voie B nécessite un nouveau module entier** car les endpoints, l'auth (Service Account vs OAuth) et le format diffèrent.

---

## Spec Aftab (LFP — Voie B)

> *Product data refers to the offer's static values (description, size, colour, etc.). You can refresh this data within 30 days. Google uses GTINs as strong identifiers to ingest merchant offers. Most of the offers should have a GTIN.*
>
> *Inventory data refers to quantity and price. Send daily inventory data for each participating store.*
>
> *Sales data is required if regular inventory data is not available.*
>
> *Store identification (optional) refers to the store code either from the Google Business Profile linked to the Merchant Center account or from a dedicated store data.*

---

## Audit Voie A — `transformProductToGoogle` (`feed.ts`)

| Champ | Code actuel | Spec Google | Conforme ? |
|---|---|---|---|
| `offerId` | `product.id` (UUID) | string unique par marchand | ✅ |
| `gtin` | `product.ean!` | string 8-14 digits | ✅ (filterEligibleProducts garantit non-null) |
| `title` | `canonical_name ?? name` | string ≤ 150 chars | ⚠️ pas de troncation, risque si nom trop long |
| `price.value` | `product.price!.toFixed(2)` (ex: "129.99") | string décimal | ✅ |
| `price.currency` | `"EUR"` | ISO 4217 | ✅ |
| `imageLink` | `photo_processed_url ?? photo_url` | URL absolue HTTPS | ✅ (R2 hébergé en HTTPS) |
| `availability` | `"in_stock" \| "out_of_stock"` | `"in stock"` / `"out of stock"` (avec espace, voir [doc](https://support.google.com/merchants/answer/6324448)) | ❌ **non conforme** |
| `channel` | `"local"` | `"local"` ou `"online"` | ✅ |
| `contentLanguage` | `"fr"` | ISO 639-1 | ✅ |
| `targetCountry` | `"FR"` | ISO 3166-1 alpha-2 | ✅ |
| `condition` | `"new"` | `"new"` / `"refurbished"` / `"used"` | ✅ |
| `storeCode` | `conn.store_code` | Google Business Profile store code | ✅ (assumé valide) |

### Champs manquants (probablement requis par Google)

| Champ | Requis pour | Manquant |
|---|---|---|
| `description` | Local catalog | ⚠️ si Google requiert description, on devrait l'envoyer (`products.description` existe en DB) |
| `brand` | Recommandé GTIN matching | ❌ non envoyé (`products.brand` existe en DB) |
| `mpn` (Manufacturer Part Number) | Fallback si pas de GTIN | ❌ non envoyé, pas en DB |
| `googleProductCategory` | Catégorisation Google | ❌ non envoyé (la taxonomie Two-Step diffère de la Google Product Taxonomy) |
| `productTypes` | Hiérarchie produit | ⚠️ on a `category` mais pas mappé |
| `sizes` | Variantes taille | ⚠️ on a `products.size` mais pas envoyé |
| `color` | Variantes couleur | ⚠️ on a `product_tags` color mais pas envoyé |
| `shippingLabel` | Pour LIA | n/a si on fait Free Local Listings only |

---

## Audit Voie A — `cron/google-feed/route.ts`

### Endpoint utilisé

```
POST /products/v1beta/${parent}/productInputs:insert
```

**Confirmation** : c'est bien le Merchant API standard (Voie A), pas LFP. Pour LFP, il faudrait `POST lfp/v1/${parent}/lfpInventories:insert`.

### Logique cron

| Comportement | Status |
|---|---|
| Auth bearer token via `CRON_SECRET` | ✅ pattern standard |
| Itère sur les `google_merchant_connections` actives | ✅ |
| Refresh OAuth via `getGoogleAccessToken` | ✅ (assumé fonctionnel, à vérifier) |
| Filtre produits eligible via `filterEligibleProducts` | ✅ (ean + visible + price + photo) |
| Push 1 produit par appel | ⚠️ pas batch — N appels sérialisés. À 100 produits × 7 marchands = 700 appels. OK si rate limit Google = 2000/100s |
| Update `products_pushed`, `last_feed_at`, `last_feed_status` | ✅ |
| Capture erreurs via `captureError` | ✅ best-effort |
| Update statut error si crash niveau merchant | ✅ |
| Schedule via `vercel.json` cron | ❓ **à vérifier que le cron est bien configuré dans `vercel.json`** |

---

## Spec Voie B — Inventory format requis (`lfp/v1/lfpInventories:insert`)

D'après [Google docs LFP](https://developers.google.com/merchant/api/guides/local-feeds-partnership/overview) + recherche du 31 mars :

```json
{
  "targetAccount": "123456789",         // ID du marchand cible (sub-account MC)
  "storeCode": "STORE_001",             // Code GBP store
  "offerId": "SKU-12345",
  "regionCode": "FR",
  "contentLanguage": "fr",
  "gtin": "3614271234567",
  "price": {
    "amountMicros": "29990000",         // ⚠️ MICROS, pas decimal !
    "currencyCode": "EUR"
  },
  "availability": "in stock",            // ⚠️ AVEC ESPACE, pas underscore
  "collectionTime": "2026-03-31T10:00:00Z",  // ISO 8601
  "pickupMethod": "buy",                 // ou "reserve", "ship to store", "not supported"
  "pickupSla": "same day"                // ou "next day", "2-day", etc.
}
```

### Différences majeures Voie A vs Voie B

| Aspect | Voie A (productInputs) | Voie B (lfpInventories) |
|---|---|---|
| Endpoint | `/products/v1beta/.../productInputs:insert` | `/lfp/v1/.../lfpInventories:insert` |
| Auth | OAuth utilisateur (token marchand) | Service Account |
| Compte | Sub-account du marchand | Notre MCA |
| Format prix | string `"29.99"` | object `{ amountMicros: "29990000" }` |
| Format availability | `"in_stock"` (notre code, **wrong**) | `"in stock"` |
| `targetAccount` | n/a (token implique le compte) | obligatoire (ID sub-account marchand) |
| `collectionTime` | non requis | obligatoire (ISO 8601) |
| `pickupMethod` | non requis | obligatoire |
| `pickupSla` | non requis | obligatoire |

→ **Voie B = nouveau module from scratch.** Le code actuel n'est pas réutilisable tel quel.

---

## Conclusion — 3 niveaux de remédiation

### 🔴 CRITIQUE (à fixer avant tout test live Voie A)

1. **`availability` literal** : changer `"in_stock" / "out_of_stock"` → `"in stock" / "out of stock"` dans `feed.ts:19,40` et le type. **Risque actuel** : Google peut rejeter silencieusement le feed.

### 🟡 IMPORTANT (à compléter avant le call ou rapidement après)

2. **Champs descriptifs manquants** : ajouter `description`, `brand`, `productTypes` (mappé depuis `category`), `googleProductCategory` (mapping à créer entre taxonomie Two-Step et Google Product Taxonomy).
3. **Truncation `title`** à 150 chars pour éviter rejets.
4. **Vérifier `vercel.json`** : le cron `google-feed` est-il configuré avec le schedule `0 3 * * *` ?

### 🟢 STRATEGIQUE (pour devenir LFP Trusted, post-approbation Google)

5. **Voie B = nouveau module** `src/lib/google/lfp.ts` à créer après que Google active les endpoints LFP sur notre sub-account :
   - `lfpStoresInsert(targetAccount, storeCode, address)` — déclarer chaque magasin
   - `lfpInventoriesInsert(targetAccount, storeCode, product)` — push inventory au format LFP
   - `lfpSalesInsert(...)` — optionnel si inventory daily régulier
   - `lfpMerchantStatesGet(targetAccount)` — monitoring statut
   - Auth Service Account (pas OAuth marchand)
   - Format `price.amountMicros` (pas decimal)
   - Format `availability` `"in stock"` (avec espace)
   - Champs obligatoires `collectionTime`, `pickupMethod`, `pickupSla`

**Estim Voie B** : 1-2 jours dev pur, mais bloqué jusqu'à activation Google côté sub-account LFP.

---

## Recommandation

**Avant le call avec le specialist** :

- ✅ Fix le `availability` literal (~5 min de code, gros risque sinon)
- ❓ Optionnellement compléter les champs descriptifs manquants

**Pendant le call** :

- Mentionner que Voie A est implémentée mais avec un fix `availability` à pousser
- Demander explicitement quand les endpoints LFP seront activés sur notre sub-account pour qu'on puisse coder Voie B (sinon on perd 1-2 jours sur du code qui peut diverger des specs finales que Google donnera)

**Après approbation LFP** :

- Implémenter Voie B en suivant les specs Google + retours du specialist
- Migrer progressivement les marchands de Voie A vers Voie B (ou les laisser en parallèle, à voir)
