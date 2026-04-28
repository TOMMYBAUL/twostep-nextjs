# CLIP V1 — Design + activation guide (Cycle 8 nuit 2026-04-25→26)

> **Status** : first-jet, code écrit en autonomie pendant la nuit. **NE TOURNE PAS encore en prod** — Thomas doit configurer 2 credentials demain matin pour activation (~15 min).
>
> **Source de vérité architecture** : brain `06-Tech/CLIP-integration-cloudflare.md` + `06-Tech/Socle-identification-cascade.md` Tier 4.
>
> **Objectif** : Tier 4 cascade enrichissement (score 0.92 si similarité ≥ 0.95 entre une photo produit marchand et la base d'embeddings Two-Step).

## Pourquoi V1 sur Replicate (pas FashionCLIP self-hosted)

Le brain recommandait FashionCLIP via Replicate pour V1. Vérification 2026-04-25 :
- **FashionCLIP n'existe pas sur Replicate** (URL `replicate.com/patrickjohncyh/fashion-clip` retourne 404)
- FashionCLIP est sur Hugging Face uniquement (`patrickjohncyh/fashion-clip`)
- Pour l'activer faudrait soit : (a) créer un custom Replicate model, (b) utiliser HF Inference API, (c) self-host Python script

**Décision V1 first-jet** : `andreasjansson/clip-features` sur Replicate (CLIP base OpenAI, 768 dims). Compromis acceptable :
- Pricing : ~$0.001/inference
- Couverture mode : moins bon que FashionCLIP (-17% MRR selon le brain) mais largement suffisant pour first jet
- Setup : 5 min (compte Replicate + token)

**Migration FashionCLIP V1.5** prévue quand :
- Volume > 100k embeddings/mois (justifie self-host coût fixe)
- OU budget validé pour build custom Replicate FashionCLIP
- OU ami envoie son code (Thomas mentionne 2026-04-25)

À ce moment-là, swap = 1 fichier `clip-replicate.ts` à modifier (interface stable).

## Pourquoi Cloudflare Vectorize via REST API (pas Workers binding)

Two-Step tourne sur **Vercel + Next.js**, pas Cloudflare Workers. Donc :
- Workers binding inutilisable directement
- → **REST API** : `https://api.cloudflare.com/client/v4/accounts/{account_id}/vectorize/v2/indexes/{index_name}/...`
- Auth : Cloudflare API token avec permission `Vectorize:Edit`
- Account ID déjà connu via `R2_ACCOUNT_ID` (env existante)

Free tier limites confirmées :
- 100 indexes / compte
- 10M vectors / index
- 1536 dims max (CLIP 768 = OK)
- 5000 vectors / batch upsert HTTP

→ Largement suffisant pour V1-V2 Two-Step (estimation 50k vectors à 250 marchands × 200 produits).

## Architecture flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Marchand upload photo dashboard OU import CSV avec Photo URL            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
              ┌──────────────────────────────────────────┐
              │ Trigger : products.photo_url change      │
              │ (DB trigger ou hook applicatif)          │
              └─────────────────┬────────────────────────┘
                                │
                                ▼
              ┌──────────────────────────────────────────┐
              │ Pipeline embed (async background job)    │
              │  1. Détourage rembg (existant Hetzner)   │
              │  2. Inference Replicate CLIP             │
              │     → embedding 768 dims                 │
              │  3. Push Vectorize index "products-v1"   │
              │     metadata: {product_id, brand, cat}   │
              │  4. Stocker version model + score local  │
              │     dans products.clip_embedding_status  │
              └─────────────────┬────────────────────────┘
                                │
                                ▼
              ┌──────────────────────────────────────────┐
              │ runCascade(input) sur produits sans EAN  │
              │ ou EAN obscur :                          │
              │  - Si product_id a un embedding → query  │
              │    Vectorize topK=5 cosine              │
              │  - Si meilleur score >= 0.95             │
              │    → tier4_clip ajouté, +0.92 score      │
              │  - boostable par convergence Tier 2/6    │
              └──────────────────────────────────────────┘
```

## Index Vectorize : config

| Paramètre | Valeur |
|---|---|
| Index name | `twostep-products-v1` |
| Dimensions | 768 (CLIP-features) |
| Metric | cosine |
| Metadata indexed | `brand`, `category`, `merchant_id` (filterable) |

Note : on **N'INDEXE PAS** `merchant_id` dans le sens "isoler par tenant" — pour bénéficier du boost cross-marchand (ex Nike AF1 photographié 5× par 5 marchands → meilleure base pour matcher le 6e). On stocke `merchant_id` en metadata à des fins d'audit / traçabilité (cf décision Cycle 4 : index global avec metadata anonymisée par défaut).

## Schema DB

Migration 090 ajoute à `products` :
- `clip_embedding_status` ENUM (`'pending', 'embedded', 'failed', 'skipped'`)
- `clip_embedding_model` TEXT (versioning, ex `"replicate-clip-features-v1"`)
- `clip_embedded_at` TIMESTAMPTZ

Pas de stockage du vector lui-même en DB locale → **single source of truth = Vectorize**. La DB locale juste tracking d'état.

## Coûts attendus V1 (premier mois pilote)

Hypothèses : Kap pilote, ~200 produits, photos changées rarement post-onboarding.

| Item | Cost/mo |
|---|---|
| Replicate CLIP-features × 200 embeddings initial | ~0.20 € |
| Replicate ~50 embeddings/mo updates | ~0.05 € |
| Vectorize free tier | 0 € |
| Total V1 marchand-pilote | **~0.25 €/mo** |

Donc négligeable. Quand on monte à 50 marchands × 200 produits = 10k embeddings × 0.001 = ~10 €/mois. Toujours OK.

## 🔧 Activation Thomas demain (~15 min)

### Étape 1 — Compte Replicate (5 min)

1. https://replicate.com → Sign up (gratuit)
2. Settings → API tokens → Create token, nom "twostep-prod"
3. Copier le token `r8_...` (ne le colle pas dans le chat — direct VS Code/Vercel)

### Étape 2 — Index Cloudflare Vectorize (5 min)

1. https://dash.cloudflare.com → ton compte (même que R2)
2. Workers & Pages → Vectorize → **Create index**
3. Name : `twostep-products-v1`
4. Dimensions : `768`
5. Metric : `Cosine`
6. Save
7. Settings (haut droite profile) → API Tokens → Create token
8. Permissions : `Account.Vectorize.Edit`
9. Account Resources : ton compte
10. Copier le token

### Étape 3 — Vercel env vars (5 min)

```bash
# Dans le terminal local, pas dans le chat
vercel env add REPLICATE_API_TOKEN production "" --yes
# → coller r8_...

vercel env add CLOUDFLARE_API_TOKEN production "" --yes
# → coller le token Cloudflare

vercel env add CLOUDFLARE_VECTORIZE_INDEX production "" --value "twostep-products-v1" --yes
```

Pareil pour preview si tu veux tester en preview avant prod.

### Étape 4 — Migration DB (1 commande)

Migration 090 sera dans le code committé cette nuit. Application via Supabase MCP au moment du merge.

### Étape 5 — Test E2E

1. Sur prod (ou preview) avec un produit pilote ayant `photo_url` non null :
   ```
   POST /api/admin/clip/embed-product
   { "productId": "..." }
   ```
2. Vérifier `products.clip_embedding_status='embedded'` en DB
3. Vérifier que le vector existe dans Vectorize via dashboard Cloudflare
4. Sur un autre produit similaire (même marque/catégorie), call cascade :
   - Score doit inclure `tier4_clip` si similarité ≥ 0.95
   - Si convergence avec Tier 2 → 0.985+ → publish auto

## ⚠️ Limites honnêtes V1

1. **CLIP base, pas FashionCLIP** : -17% précision sur mode vs FashionCLIP. Acceptable V1.
2. **Aucun test E2E réel possible cette nuit** : credentials manquent. Code écrit = squelette + tests mockés.
3. **Pas de batching pour bootstrap** : un appel Replicate par embedding. Pour 200 produits Kap = 200 calls séquentiels = ~3-5 min. Acceptable.
4. **Pas de retry sur échec Replicate** V1 : si l'API Replicate renvoie 5xx, on log + on marque `failed`. Pas de cron retry V1. À ajouter en V1.5.
5. **Photo URL doit être publique** : Replicate pull la photo depuis URL. Donc R2 public (déjà OK pour Two-Step) marche, mais URLs avec auth (Drive privé) non.
6. **Vectorize REST API a des limites de batch** (5000 vectors/req). Pour 50k vectors total, on découpera. Pas un problème immédiat.
7. **Confidentialité** : photos marchand passent par Replicate (USA) avant push Vectorize (Cloudflare). Pour V1 pré-pilote = acceptable. Pour clients luxe / conf B2B futurs → évaluer self-host.

## Files livrés cycle nuit

| File | Status |
|---|---|
| `docs/cascade/CLIP-V1-DESIGN.md` | ✅ ce fichier |
| `supabase/migrations/090_products_clip_embedding_status.sql` | à venir cycle 8.2 |
| `src/lib/enrichment/clip-replicate.ts` | à venir cycle 8.3 |
| `src/lib/enrichment/vectorize-client.ts` | à venir cycle 8.4 |
| `src/lib/enrichment/clip-pipeline.ts` | à venir cycle 8.5 |
| `src/app/api/admin/clip/embed-product/route.ts` | à venir cycle 8.5 |
| Tier 4 wired dans `cascade-engine.ts` | à venir cycle 8.6 |
| `tests/lib/enrichment/clip-*.test.ts` | à venir cycle 8.7 |
| `docs/cascade/CLIP-V1-ACTIVATION.md` | à venir cycle 8.8 (étapes pas-à-pas matin) |

---

**Last updated** : 2026-04-25 cycle 8.1 (design).
