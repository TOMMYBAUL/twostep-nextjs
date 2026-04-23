# T13 — Audit sécurité RLS Supabase Two-Step

*Quotas cycle 03 : 1 web_search. Confidence 8/10.*

## Findings — RLS best practices Supabase multi-tenant

### Règles critiques

1. **RLS obligatoire** sur toute table d'un schema exposé (public, auth). Sans RLS = **données publiques** via l'API REST Supabase.
2. **tenant_id / merchant_id** sur chaque table + policy matching JWT claim
3. **Indexer les colonnes RLS** (sinon killer de performance)
4. **USING (read/delete) + WITH CHECK (write)** — UPDATE nécessite les deux
5. **Tester depuis client SDK**, pas SQL Editor (qui bypass RLS)
6. **Service role key JAMAIS côté client** (brain MEMORY note déjà ce pattern)
7. **Ne PAS se baser sur user_metadata** dans les policies (modifiable par le user)

### Défense en profondeur

Même si l'app a un bug, RLS protège à la couche DB. Doit être pensé comme safety net, pas comme first line.

## Application Two-Step — Audit à faire

### Tables critiques à auditer

D'après le brain + gitnexus :
- `merchants` — tenant table racine
- `products` — lié merchant
- `stock` — lié product (transitif merchant)
- `pos_connections` — secrets encrypted, lié merchant
- `google_merchant_connections` — OAuth tokens
- `invoices` + `invoice_items` — factures email
- `ean_lookups` — cache cross-tenant (à dessein shared)
- `webhook_events` — idempotence
- `cloture_sessions` — plan 06
- `feed_events` — tracking LFP
- `subscribers`, `newsletter_emails` — conso

### Audit checklist (à faire par Thomas lundi)

```sql
-- 1. Lister toutes les tables sans RLS activée
SELECT tablename
FROM pg_tables t
LEFT JOIN pg_class c ON t.tablename = c.relname
WHERE schemaname = 'public'
  AND c.relrowsecurity = false;

-- 2. Lister les tables RLS activées mais SANS policy
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_class c ON t.tablename = c.relname
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE schemaname = 'public'
  AND c.relrowsecurity = true
  AND p.policyname IS NULL;

-- 3. Index sur merchant_id partout
SELECT tablename
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_indexes WHERE indexdef LIKE '%merchant_id%'
  );
```

### Risques potentiels Two-Step (à investiguer)

1. **`ean_lookups` cache partagé** — voulu cross-tenant. **À vérifier** : aucun champ sensible (prix privé marchand) ne doit être écrit dans cette table. Le `hit_count` global est OK.
2. **`webhook_events`** — table d'idempotence. Doit être `service_role only` (pas de RLS user).
3. **`pos_connections.access_token`** — encrypted. Vérifier que le RLS empêche même un admin client de lire le token d'un autre marchand.
4. **`invoices` received via email router** — l'insertion se fait côté serveur (service_role). RLS doit juste empêcher la lecture cross-tenant.
5. **`merchants` table** — un user peut-il voir son propre merchant_id mais pas d'autres ? Critique pour la liste "top 100 merchants" côté admin.

### Recommandations actionnables

1. **Lundi matin**, Thomas exécute les 3 queries check + audit manuel de chaque policy critique
2. **Ajouter un test automatique** : script Node.js qui fait un `curl` anonyme + auth sur un autre merchant → doit échouer
3. **Documenter dans le brain** une fiche `Security/RLS-policies-audit-2026-04-23.md` avec état de chaque table + policy
4. **Alert Sentry** sur tout query anormal : si un user fait 1000 requêtes sur `products` où `merchant_id != son_merchant_id`, alerter
5. **Rotation service_role** programmée tous les 90 jours (MEMORY mentionne une rotation récente 2026-04-21 OK)

## Confidence : 8/10

Best practices bien documentées. L'audit concret Two-Step reste à faire par Thomas. Le brain mentionne "sécurité bien pensée RLS partout" (audit 2026-04-23) — mais sans check systématique depuis.

## Sources

- [Row Level Security — Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase RLS Best Practices Multi-Tenant — MakerKit](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- [Best Practices Supabase Security Scaling — Leanware](https://www.leanware.co/insights/supabase-best-practices)
- [Enforcing RLS in Supabase — DEV Community](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
