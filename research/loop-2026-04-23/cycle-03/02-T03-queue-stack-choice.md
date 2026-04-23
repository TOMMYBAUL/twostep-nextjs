# T3 — Queue stack choice pour Two-Step enrichment jobs

*Quotas cycle 03 : 1 web_search. Confidence 8/10.*

## Findings

### Options serverless-friendly Vercel

| Solution | Architecture | Best for | Coût |
|---|---|---|---|
| **Upstash QStash** | HTTP serverless, stateless | Vercel/Cloudflare, <1M jobs/jour | $0.20/100K cmd, free 500K/mois |
| **BullMQ** | Redis persistent connection | Traditional servers (VPS) | Coût Redis + maintenance |
| **Supabase Queue (pgmq)** | PostgreSQL native | Déjà Supabase, DB-centric | Inclus Supabase |
| **Vercel KV (= Upstash)** | Même que Upstash | Intégration native Vercel | Idem Upstash |

### Reco pour Two-Step

**Upstash QStash** = choix logique car :
- Two-Step est déjà sur Vercel
- Pas de infra à maintenir (vs BullMQ + Redis managed)
- Free tier 500K commands/mois largement suffisant (bootstrap 30 produits = 30 jobs, 500 produits CSV = 500 jobs — OK très longtemps)
- MEMORY note déjà "Upstash Redis" comme dépendance envisagée (reference couts)
- HTTP-based → no connection pool problem en serverless
- Retry / backoff natif pour les cas Groq 429

### Alternative pgmq (Supabase native)

Supabase a récemment ajouté `pgmq` extension (PostgreSQL message queue). Avantages :
- Déjà sur Supabase → 0 dépendance supplémentaire
- Transactionnel avec le reste de la DB (si job fait insert produit, tout commit ensemble)

Inconvénients :
- Moins de tooling/dashboard que QStash
- Doc Supabase moins mature

**Décision** : commencer avec **QStash** (plus mature, gestion retry out-of-box), évaluer migration pgmq Phase 2-3 si coût devient un enjeu.

## Architecture proposée

```
[User upload CSV 500 produits]
           ↓
   POST /api/catalog/import
           ↓
   Insert 500 products (review_status=pending)
           ↓
   For each product: qstash.publish({url: "/api/enrich/one", body: {productId}})
           ↓
   QStash throttle à 25 RPM (respect Groq limit)
           ↓
   /api/enrich/one reçoit webhook → enrichit 1 produit → update DB
           ↓
   Notif email marchand "enrichissement terminé" quand tous OK
```

### Effort d'implémentation

- Installation QStash SDK : 30 min
- Route d'ingestion + enqueue : 2h
- Route worker `/api/enrich/one` : refactor de l'existant `resolveAndEnrich`, ~3h
- Retry/error handling : 2h
- UI feedback marchand : 2h
- Tests : 2h

**Total : ~1-2 jours dev.** Pas urgent Phase 1 (aucun marchand actif), à lancer quand 3e marchand bootstrap.

## Recommandations

1. **Phase 1 (0-5 marchands)** : pas de queue. Bootstrap direct synchrone avec respect rate limit Groq manuel (1 request / 2 sec). OK pour faible volume.
2. **Phase 2 (5-20 marchands)** : **implémenter QStash** queue + workers
3. **Phase 3 (50+)** : évaluer migration pgmq si coût QStash devient significatif

## Confidence : 8/10

Architecture standard bien documentée. Choix QStash cohérent avec stack Two-Step.

## Sources

- [Compare — Upstash Documentation](https://upstash.com/docs/qstash/overall/compare)
- [Upstash QStash Serverless Background Jobs — DEV Community](https://dev.to/whoffagents/upstash-qstash-serverless-background-jobs-without-the-infrastructure-pain-ic8)
- [BullMQ Official](https://bullmq.io/)
- [Upstash for Vercel — Vercel Marketplace](https://vercel.com/marketplace/upstash)
