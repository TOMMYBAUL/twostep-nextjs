# CLIP V1 — Guide d'activation matinal pour Thomas (2026-04-26)

> **Pré-requis** : la branche `feat/phase1-cascade-validators` doit être mergée sur `main` (ou tu testes en preview branche).
>
> **Total temps estimé** : 15-20 min, dont 10 min de tes clics dans 3 dashboards externes + 5 min de tests E2E.

## ⏱️ Temps Thomas vs temps automatique

| Étape | Toi (clicks) | Auto (Claude) |
|---|---|---|
| 1. Compte Replicate | 3 min | — |
| 2. Index Cloudflare Vectorize | 5 min | — |
| 3. Set 3 env vars Vercel | 2 min | — |
| 4. Apply migration 090 | 30 sec | — |
| 5. Deploy preview | 1 min | — |
| 6. Test E2E (1 produit) | 2 min | — |
| 7. Vérifier Vectorize dashboard | 2 min | — |

## Étape 1 — Compte Replicate (3 min)

1. https://replicate.com/signin → S'inscrire ou login
2. **Settings → API tokens** → "Create token"
3. Nom : `twostep-prod`
4. **Copier** le token `r8_...` (1 seule fois affiché — copie tout de suite dans VS Code dans un fichier scratch local, **PAS dans le chat Claude**)

⚠️ Replicate va te demander de configurer un mode de paiement (carte bancaire) pour activer les API calls. Le free tier inclut **quelques crédits gratuits initiaux**. Pour Two-Step V1 pilote (~250 embeddings) tu vas dépenser ~0.25 €. Tu peux mettre une CB sans risque.

## Étape 2 — Index Cloudflare Vectorize (5 min)

1. https://dash.cloudflare.com → ton compte (le même que celui qui héberge R2)
2. Menu gauche → **Workers & Pages** → onglet **Vectorize**
3. Click **Create**
4. **Name** : `twostep-products-v1`
5. **Dimensions** : `768`
6. **Distance metric** : `Cosine`
7. **Description** : "Two-Step product embeddings CLIP V1"
8. Click "Create index"

⚠️ Quand tu crées l'index, **note bien le nom EXACT** — il doit matcher la valeur env var (étape 3).

### Créer un API token Cloudflare avec permission Vectorize

1. Toujours sur dash.cloudflare.com → **profile photo** (haut droite) → **My Profile**
2. Onglet **API Tokens** → **Create Token**
3. Choisir "Custom token" (pas un template)
4. **Token name** : `twostep-vectorize-prod`
5. **Permissions** :
   - Account → `Vectorize` → `Edit`
6. **Account Resources** : Include → ton compte (le seul probablement)
7. (Optionnel) **TTL** : laisse "Forever" ou mets 1 an
8. Click "Continue to summary" → "Create Token"
9. **Copier** le token immédiatement (ne se réaffiche plus). Idem que Replicate : direct dans ton fichier scratch local, pas dans le chat.

## Étape 3 — Vercel env vars (2 min)

Dans le terminal local, depuis `C:\Users\thoma\Desktop\IA\twostep-nextjs` :

```bash
# Replicate
npx vercel env add REPLICATE_API_TOKEN production "" --yes
# → quand prompt arrive, colle r8_...

# Cloudflare API token
npx vercel env add CLOUDFLARE_API_TOKEN production "" --yes
# → colle le token Cloudflare

# Nom de l'index (doit matcher ce que tu as créé étape 2)
npx vercel env add CLOUDFLARE_VECTORIZE_INDEX production "" --value "twostep-products-v1" --yes

# Optionnel — pour tester aussi en preview avant prod :
npx vercel env add REPLICATE_API_TOKEN preview "" --yes
npx vercel env add CLOUDFLARE_API_TOKEN preview "" --yes
npx vercel env add CLOUDFLARE_VECTORIZE_INDEX preview "" --value "twostep-products-v1" --yes
```

⚠️ **Re-vérifie** que `R2_ACCOUNT_ID` est bien set en preview aussi (`vercel env ls preview | grep R2_ACCOUNT_ID`). Sans ça, le client Vectorize crash car il partage l'account ID avec R2.

## Étape 4 — Apply migration 090 (30 sec)

La migration `090_products_clip_embedding_status.sql` ajoute :
- ENUM `clip_embedding_status` (pending/embedded/failed/skipped)
- 4 colonnes sur `products` (status, model, embedded_at, error)
- 1 index partiel pour la queue

**Applique via Supabase MCP** (ou demande à Claude de le faire, il a accès via `mcp__claude_ai_Supabase__apply_migration`). Ou manuellement via Supabase dashboard SQL editor en collant le contenu du fichier.

## Étape 5 — Deploy preview (1 min)

```bash
git push origin feat/phase1-cascade-validators
# Vercel auto-deploy preview, ~2-3 min
```

Surveille https://vercel.com/.../twostep-nextjs/deployments pour voir le deploy READY.

## Étape 6 — Test E2E (~2 min)

Trouve un product `id` qui a une **photo URL publique** dans ta DB. Exemple via Supabase MCP :
```sql
SELECT id, name, photo_url, photo_processed_url, brand, category
FROM products
WHERE merchant_id = '547e786d-7cb9-46f2-9f5b-2f55449fd795' -- merchant Two-Step Test
  AND (photo_url IS NOT NULL OR photo_processed_url IS NOT NULL)
LIMIT 1;
```

Trigger l'embed via le endpoint admin :
```bash
# Sur preview ou prod selon où tu as set les env vars
curl -X POST https://www.twostep.fr/api/admin/clip/embed-product \
  -H "Cookie: ..." \  # cookie de session admin (récup via DevTools)
  -H "Content-Type: application/json" \
  -d '{"productId":"<UUID>"}'
```

Plus simple via le dashboard si on a un bouton (à coder en V1.5). Pour V1, tu peux le faire via le browser console authentifié (snippet) :
```js
fetch('/api/admin/clip/embed-product', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({productId: '<UUID>'})
}).then(r => r.json()).then(console.log);
```

**Réponse attendue** :
```json
{ "status": "embedded", "model": "replicate-clip-features:75b33f25", "latency_ms": 2847 }
```

Si tu vois ça : ✅ ça marche. Si erreur, voir section troubleshooting ci-dessous.

## Étape 7 — Vérifier Vectorize dashboard (2 min)

1. https://dash.cloudflare.com → Workers & Pages → Vectorize → `twostep-products-v1`
2. Onglet **Vectors** : tu dois voir 1 vector apparu (l'ID = ton product UUID)
3. Onglet **Metrics** : tu peux voir les query/upsert récents

## Troubleshooting probable

| Erreur | Cause probable | Fix |
|---|---|---|
| `REPLICATE_API_TOKEN not configured` | Pas pushé en Vercel ou pas redéployé | `vercel env ls production` → check, redeploy |
| `Replicate prediction failed: image not accessible` | URL photo non-publique (Drive privé, signed) | Photo doit être HTTPS publique |
| `R2_ACCOUNT_ID not configured` | Vectorize client emprunte cette env | `vercel env ls production \| grep R2_ACCOUNT_ID` |
| `Vectorize /upsert 403` | API token Cloudflare manque permission Vectorize:Edit | Recréer token avec bonne permission |
| `Vectorize /upsert 400 Invalid vector dim` | Index créé avec mauvais dimensions | Recréer avec 768 |
| Embedding réussit mais Vectorize search retourne rien | Index nom != env var | Compare `vercel env ls \| grep VECTORIZE_INDEX` avec dashboard |

## Workflow recommandé — bootstrap Kap pilote (Cycle 10 endpoint)

Quand tu auras Kap signé et son catalogue importé, **utilise le endpoint bootstrap** créé Cycle 10 :

```bash
# Snippet console authentifié (DevTools sur www.twostep.fr) :
async function bootstrapKap() {
  let total = 0;
  while (true) {
    const r = await fetch('/api/admin/clip/bootstrap-merchant', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ merchantId: 'KAP_UUID', limit: 20, retryFailed: true })
    }).then(r => r.json());
    console.log(r);
    total += r.embedded + r.skipped + r.failed;
    if (r.total_to_process === 0 || r.remaining_estimate === 0) break;
  }
  console.log(`Total processed: ${total}`);
}
bootstrapKap();
```

**Comportement** :
- Filtre products Kap avec photo_url non-null + status `pending` ou `failed`
- Boucle séquentielle interne, ~3s par produit Replicate
- `limit=20` par batch pour rester sous 60s Vercel Hobby timeout
- Retourne compteurs `embedded` / `skipped` / `failed` + `remaining_estimate`
- Idempotent : re-call sur un produit déjà embedded = skip (déjà filtré)

**Pour 200 produits Kap** : ~10 batches × 60s = 10 min total.

V1.5 : on packagera en cron + queue Inngest pour scaler à plusieurs marchands en parallèle.

## Coût attendu Kap pilote

- Replicate : 200 inferences × $0.001 = **$0.20** soit ~0.20 €
- Vectorize : free tier (200 vectors << 10M)
- Total : **~0.20 €** pour bootstrap complet Kap

## Tests et fichiers créés cette nuit

| File | Status |
|---|---|
| `docs/cascade/CLIP-V1-DESIGN.md` | ✅ design complet |
| `docs/cascade/CLIP-V1-ACTIVATION.md` | ✅ ce fichier |
| `supabase/migrations/090_products_clip_embedding_status.sql` | ✅ migration prête |
| `src/lib/enrichment/clip-replicate.ts` | ✅ wrapper Replicate (146 lignes) |
| `src/lib/enrichment/vectorize-client.ts` | ✅ wrapper Vectorize REST (130 lignes) |
| `src/lib/enrichment/clip-pipeline.ts` | ✅ pipeline embed + query (190 lignes) |
| `src/app/api/admin/clip/embed-product/route.ts` | ✅ endpoint admin |
| `tests/lib/enrichment/clip-replicate.test.ts` | ✅ 6 tests |
| `tests/lib/enrichment/vectorize-client.test.ts` | ✅ 11 tests |
| `tests/lib/enrichment/clip-pipeline.test.ts` | ✅ 7 tests |

**Total cycle 8** : 24 nouveaux tests, 0 regression sur les 199 existants.

## ⚠️ Limites V1 honnêtes (rappel du DESIGN doc)

1. **CLIP base, pas FashionCLIP** : -17% précision sur mode. Acceptable V1.
2. **`tryClipMatchForProduct`** dans `clip-pipeline.ts` retourne `matched=false` toujours en V1 → l'intégration cascade Tier 4 nécessite implémenter `getVectorById` dans `vectorize-client.ts` (à venir Cycle 9).
3. **Pas de retry automatique** sur échec Replicate — V1.5 via Inngest.
4. **Pas de bootstrap batch** — pour 200+ produits Kap, on appelle séquentiellement (5-10 min). Suffisant V1.
5. **CLIP pipeline pas wired dans cascade-engine** — pour aujourd'hui c'est seulement utilisable via le endpoint admin pour bootstrap. Tier 4 dans `runCascade` viendra en Cycle 9 quand on ajoute `getVectorById`.

## Prochaines étapes (post-activation)

- **Cycle 9** : implem `getVectorById` Vectorize REST + wire Tier 4 dans `cascade-engine.ts`
- **Cycle 10** : UI dashboard pour status embeddings (combien embedded / pending / failed par marchand)
- **Cycle 11** : queue Inngest pour scaler embed batch
- **V1.5** : compare avec le code de l'ami quand reçu, swap CLIP → FashionCLIP si gain significatif

---

**Bonne activation !** Tu m'envoies le résultat du test E2E demain et on continue à partir de là.
