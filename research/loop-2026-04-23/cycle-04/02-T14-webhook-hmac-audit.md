# T14 — Webhook HMAC audit Two-Step (Stripe, Square, Shopify)

*1 search. Confidence 7.5/10.*

## Règles HMAC-SHA256 critiques par provider

### Stripe
- Header : `Stripe-Signature`
- Format : `t=timestamp,v1=sig`
- Algo : HMAC-SHA256 avec webhook secret
- Timestamp tolerance : 5 min recommandé (anti-replay)
- Raw body obligatoire

### Shopify
- Header : `X-Shopify-Hmac-SHA256`
- **Encodage base64** (pas hex ! piège classique)
- Raw body obligatoire — **pas** parsé par middleware
- Client secret de l'app

### Square
- Header : `x-square-hmacsha256-signature`
- Encodage base64
- Clé : Signature Key du webhook (pas API key)
- Body brut + URL endpoint concaténé

## Best practices sécurité universelles

1. **Constant-time equality** pour éviter timing attacks (`crypto.timingSafeEqual`)
2. **Timestamp check** : reject si >5 min d'écart (anti-replay)
3. **Raw body preserved** avant parsing
4. **Idempotency keys** côté DB (table `webhook_events` — Two-Step l'a selon MEMORY migration 061)
5. **Fail fast** : 401 si signature invalide, log minimal (pas le body entier)

## Audit Two-Step — à faire par Thomas

### Check 1 : raw body preservation (Next.js App Router)
```typescript
// DOIT utiliser await request.text() pour avoir raw body
// PAS await request.json() qui parse avant la vérification
```

### Check 2 : encodage correct par provider
- Stripe = hex → `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')`
- Shopify = base64 → `...digest('base64')`
- Square = base64 + url prépend → `...update(url + rawBody).digest('base64')`

### Check 3 : timestamp tolerance
```typescript
const timestamp = parseInt(t, 10) * 1000;
if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) {
  return new Response('Timestamp too old', { status: 401 });
}
```

### Check 4 : timingSafeEqual
```typescript
// ❌ dangereux (timing attack)
if (calculatedHmac === providedHmac) { ... }

// ✅ safe
const a = Buffer.from(calculatedHmac);
const b = Buffer.from(providedHmac);
if (a.length !== b.length) return false;
return crypto.timingSafeEqual(a, b);
```

### Check 5 : replay protection via `webhook_events` table
- Insérer `event_id` avec `ON CONFLICT DO NOTHING`
- Si conflict → event déjà traité, return 200 OK silent
- Two-Step a la table (brain migration 061) — à vérifier qu'elle est bien utilisée partout

## Routes webhook à auditer (d'après gitnexus codebase)

- `src/app/api/stripe/webhook/route.ts` (probable)
- `src/app/api/pos/[provider]/webhook/route.ts` (probable)
- `src/app/api/webhooks/*` (à lister)

## Recommandations

1. **Script test auto** : envoyer un webhook avec signature invalide → doit renvoyer 401
2. **Script test replay** : rejouer un webhook valide 2x → 2e doit être idempotent (pas de double insert)
3. **Test timestamp ancien** : webhook signé il y a 10 min → doit être rejeté
4. **Monitoring Sentry** : alerter sur > 5 `InvalidSignatureError` / minute (attaque ?)

## Confidence : 7.5/10

Best practices bien documentées. Le vrai état Two-Step n'est pas audité en profondeur cette nuit.

## Sources

- [Resolve webhook signature verification errors — Stripe Docs](https://docs.stripe.com/webhooks/signature)
- [Why Shopify Webhook HMAC Verification Keeps Failing — DEV](https://dev.to/prateek32177/why-shopify-webhook-hmac-verification-keeps-failing-4i80)
- [Webhook Security Verify Signatures — CatchHooks](https://www.catchhooks.com/blog/webhook-security-and-signature-verification)
- [How to Implement SHA256 Webhook Signature — Hookdeck](https://hookdeck.com/webhooks/guides/how-to-implement-sha256-webhook-signature-verification)
