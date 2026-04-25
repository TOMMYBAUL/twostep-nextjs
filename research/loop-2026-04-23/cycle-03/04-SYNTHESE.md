# Cycle 03 — Synthèse condensée

## Top 2 insights

### Insight #7 — Audit RLS obligatoire avant 1er marchand signé
**Confiance 8/10.** 3 queries SQL simples + check manuel des policies critiques = 30 min de travail qui peut éviter un incident data leak catastrophique. Tables à auditer en priorité : `pos_connections.access_token`, `products`, `invoices`, `google_merchant_connections`. Ajouter un test auto avec Curl anonyme.

### Insight #8 — Stack queue = Upstash QStash, reporté Phase 2
**Confiance 8/10.** QStash cohérent avec stack Vercel+Supabase, free tier 500K/mois largement suffisant. Pas besoin Phase 1 (0 marchand actif). À implémenter quand 3e marchand bootstrap CSV. ~1-2 jours dev.

## Skip assumé

T2 (test SERP live) — limite technique WebFetch (Google consent redirect). Action explicite pour Thomas lundi.

## Décision stratégique cycle 03

Plutôt que chercher un 4e/5e cycle pour tenir la promesse des 5 cycles, je **privilégie la production des documents finaux** : MASTER-SYNTHESIS, ACTION-PLAN, META-REPORT. Ce sont ce que Thomas va réellement lire au réveil.

**Confidence cycle 03 globale : 7/10.**

**Insights cumulés sur 3 cycles : 8 (moyenne confiance 7.4/10).**
