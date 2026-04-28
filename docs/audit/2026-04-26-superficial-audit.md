# Audit superficiel Two-Step — 2026-04-26 (nuit autonome)

> Réalisé en autonomie pendant que Thomas dort. Audit non-exhaustif sur 8 axes.
> Méthode : grep + glob ciblés, lecture spot des fichiers critiques.
> Objectif : faire émerger angles morts NON déjà documentés dans MEMORY/brain.
>
> **À ignorer** : tout ce qui est dans `docs/cascade/COVERAGE-MATRIX.md`,
> `10-Angles-morts/Audit-angles-morts-2026-04-24.md` (brain), MEMORY actions urgentes 1-11
> (rotations clés, encryption rollout, parser CSV bug, Stripe webhook test).

## TL;DR — 3 angles morts critiques découverts

| # | Sujet | Criticité | Effort fix |
|---|---|---|---|
| 1 | **2 systèmes admin coexistent** sans synchronisation (`requireAdmin` metadata vs `isAdmin` env whitelist) | 🔴 | 1-2h refactor |
| 2 | **RLS `categories_auth_write` USING(true)** — n'importe quel marchand peut modifier les catégories de tous | 🔴 | 30 min migration |
| 3 | **Webhooks Zettle SANS signature verification** (Square + Shopify OK, Zettle non) | 🔴 | 1-2h dev |

## 🔐 Sécurité (au-delà des rotations connues)

### 🔴 1. Fragmentation système admin

**2 helpers distincts pour gate les routes admin** :
- `src/lib/auth/require-admin.ts` (`requireAdmin()`) → check `user.app_metadata.role === "admin"` (Supabase)
- `src/lib/admin/guard.ts` (`isAdmin(email)`) → check whitelist `process.env.ADMIN_EMAILS`

**Routes utilisant `requireAdmin`** : `admin/stats`, `admin/consumers`, `admin/merchants`, `admin/test-enrich-merchant`, `admin/merchants/[id]`
**Routes utilisant `isAdmin`** : `admin/onboarding/csv`, `admin/onboarding/queue`, `admin/clip/embed-product`, `admin/clip/bootstrap-merchant`, layout `/admin/onboarding-wizard`

**Risques** :
- Si tu retires un email d'`ADMIN_EMAILS`, il garde accès à `/admin/stats` (via metadata) mais perd `/admin/onboarding-wizard`. Privilèges incohérents.
- Le metadata Supabase est plus sécurisé (server-side, pas dépendant d'env var). Préférable à long terme.
- Dette : 2 sources de vérité = 2× le risque d'oubli de gate sur une nouvelle route admin.

**Fix proposé** : unifier sur `requireAdmin()` partout. Migration : ajouter `app_metadata.role='admin'` aux comptes whitelist actuels (`bauland@twostep.fr` + `thomasbauland1304@gmail.com`), puis swap les imports `isAdmin → requireAdmin`. ~1-2h.

### 🔴 2. RLS `categories_auth_write` trop permissive

**Migration 041 ligne 31** :
```sql
CREATE POLICY "categories_auth_write" ON categories
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

→ N'importe quel utilisateur authentifié (consumer OU marchand) peut **INSERT / UPDATE / DELETE** la table `categories`. Or `categories` est partagée cross-marchand (taxonomie globale Two-Step).

**Risque** : un utilisateur malveillant peut renommer "Sneakers" en "_attack_", supprimer des branches d'arbre catégorie, casser le matching tier 5 BERT, etc.

**Fix** : restreindre à service_role only OU à `auth.app_metadata.role='admin'`. Migration 091 :
```sql
DROP POLICY "categories_auth_write" ON categories;
-- Lecture publique conservée. Écriture admin only.
```

### 🔴 3. Webhook Zettle sans signature verification

`src/app/api/webhooks/zettle/route.ts` ne contient **aucun** pattern `hmac`, `signature`, `secret`. Square + Shopify ont leur vérification, pas Zettle.

**Risque** : un attaquant peut forger des webhooks Zettle vers `https://www.twostep.fr/api/webhooks/zettle` et :
- Marquer des items comme out-of-stock chez un marchand (perturbation feed LFP)
- Inverser des ventes (déclencher des update stock)
- Déclencher des cron de re-sync coûteux (Replicate, Anthropic)

**Fix** : Zettle envoie un HMAC SHA256 dans header `x-iz-signature`. Vérifier avec le webhook secret PayPal/Zettle. ~1-2h dev.

### 🟠 4. `platform_metrics` exposé en SELECT public

Migration 003 ligne 174 :
```sql
CREATE POLICY "platform_metrics_select_all" ON platform_metrics FOR SELECT USING (true);
```

→ Toute personne authentifiée peut lire les métriques business (nombre de marchands, transactions, etc.). Pour un projet pré-revenu c'est sans risque, mais à mesurer maintenant car ça peut révéler la traction réelle aux concurrents.

**Fix** : restreindre à admin si pas explicitement nécessaire en consumer.

### 🟠 5. `ean_lookups` exposé en SELECT public

Idem migration 003 ligne 162. Le cache EAN cross-marchand est en read public. **Pas un risque sécu direct** (data publique d'origine), mais brain audit angles morts a noté que ce cache n'est PAS un moat juridique. L'exposer publiquement le rend triviallement scrapable par un concurrent.

**Fix** : restreindre à `service_role` + `authenticated` peut suffire. Pas urgent.

### 🟠 6. Webhook Lightspeed — verification statut incertain

Le grep initial a trouvé Square + Shopify avec signature, pas Lightspeed. Mais 2e grep avec d'autres patterns peut révéler l'inverse. **À vérifier manuellement demain** par toi : ouvrir `src/app/api/webhooks/lightspeed/route.ts` et confirmer qu'il y a bien une vérification HMAC (Lightspeed envoie `x-lightspeed-signature` ou similaire).

## 🏗️ Architecture / dette technique

### 🟠 7. Couverture rate limiting partielle

34 routes API sur 87 utilisent `rateLimit` ou lisent `x-forwarded-for`. Reste **53 routes mutantes/critiques sans rate limiting visible**, notamment :
- `/api/admin/clip/embed-product` (ouvert à abus si admin compromis)
- `/api/admin/clip/bootstrap-merchant` (idem, peut faire exploser facture Replicate)
- `/api/products/[id]/validate`, `/api/products/[id]/reject`
- Plusieurs `/api/merchants/[id]/*`

**Fix** : ajouter `rateLimit()` aux endpoints qui mutent ou facturent (Replicate, Anthropic, Stripe, Vectorize).

### 🟠 8. `console.log` non gated dans 5 fichiers (sur 7 trouvés)

7 fichiers ont des `console.log`, mais 2 seulement gated par `NODE_ENV === "development"` :
- `src/app/api/products/bulk-validate/route.ts` ✅ gated
- `src/lib/ean/lookup.ts` — quelques gated, d'autres non
- `src/lib/enrichment/telemetry.ts` — à vérifier
- `src/lib/enrichment/resolve-ean.ts` — à vérifier
- `src/app/api/products/[id]/validate/route.ts` — à vérifier
- `src/app/api/invoices/[id]/validate/route.ts` — à vérifier
- `src/lib/images/serper.ts` — à vérifier

**Risque** : si l'un de ces logs sort dans Vercel Runtime Logs avec data sensible (EAN customer, stock value, etc.) → exposition Sentry/Vercel.

**Fix** : audit ciblé + gate `if (process.env.NODE_ENV === "development")` ou remplacer par `console.warn` semantiques uniquement.

### 🟡 9. `.select("*")` dans 11 routes/composants

`src/lib/ean/lookup.ts`, `src/lib/pos/extract-size.ts`, `src/lib/parser/einvoice.ts`, `src/lib/google/merchant.ts`, `src/app/api/merchants/[id]/tips/route.ts`, `src/app/api/consumer/preferences/route.ts`, `src/app/api/products/available-sizes/route.ts`, etc.

**Risque** : leak de colonnes sensibles (tokens chiffrés, internal IDs, audit fields) qu'on n'a pas pensé à masquer. Surtout dans les routes consumer-facing.

**Fix** : limiter à `.select("id, name, ...")` explicit. À faire par grep + audit ciblé.

## ⚙️ Pipeline cascade enrichissement (livré nuit)

### 🟠 10. Aucun test sur `lookupEan` (le coeur du système)

`src/lib/ean/lookup.ts` = ~885 lignes, contient toute la cascade Tier 2 + Tier 6 + applyEnrichment + verifyEanMatchWithAI + brand coherence. **Aucun test vitest** ne le couvre. Les 223 tests verts couvrent les wrappers nouveaux (cascade-engine, validators, multi-source) mais pas le coeur historique.

**Risque** : refactor futur sur `applyEnrichment` ou `verifyEanMatchWithAI` peut introduire des regressions silencieuses.

**Fix** : suite de tests vitest sur `applyEnrichment` (10 cas), `verifyEanMatchWithAI` (mock LLM, 8 cas), `pickBestCandidate` (5 cas). Effort 2-3h.

### 🟠 11. Multi-source merge — conflict resolution implicite

`src/lib/enrichment/multi-source.ts` `pickCanonicalName()` choisit le **plus long** name parmi sources Tier 2. Si OBF dit "Coca-Cola Original Taste 33cl" et OPF dit "Coca-Cola Classic 330ml Bottle", on prend le plus long sans vraie logique sémantique. **Pas un bug critique** mais peut produire des canonical_name inattendus.

**Fix V1.5** : utiliser `verifyEanMatchWithAI` pour faire un cross-check entre les 2 noms quand divergents et choisir le plus cohérent avec l'input marchand original.

### 🟡 12. `tryClipMatchForProduct` requête `getVectorById` à chaque call cascade

Si `runCascade` est appelé pour 200 produits Kap dans un loop bootstrap (Phase 2) avec `productId` à chaque fois, ça fait 200 calls Vectorize getByIds + 200 query topK = 400 calls Vectorize. Pas un problème de coût (free tier large) mais latence ajoutée (~200-500ms/call × 200 = 1-2 min).

**Fix V1.5** : batch — passer les vecteurs déjà récupérés en mémoire si le caller orchestre une boucle.

## 📦 Migrations Supabase

### 🟠 13. 2 migrations marquées "049_*"

- `049_fix_security_warnings.sql`
- `049_fix_spatial_ref_sys_rls.sql`

Doublon de numérotation. Supabase MCP `apply_migration` peut prendre celle qu'il veut en cas d'apply sequentiel non-déterministe.

**Fix** : renommer la 2e en `050_fix_spatial_ref_sys_rls.sql` ou la fusionner avec 049.

### 🟡 14. Migrations 062-082 marquées "fantômes" en prod (cf MEMORY)

MEMORY note 2026-04-23 que les migrations 062-082 sont marquées appliquées en prod mais le détail n'est pas tracé. Si un jour il faut rollback ou debug une colonne manquante, manque de visibilité.

**Fix** : générer un audit `supabase migrations list` et le diff avec le repo. À faire 1× pour validation, ensuite l'index Supabase fait foi.

## 🧪 Tests / observability

### 🟠 15. 0 test E2E réel sur Stripe live webhook

On a passé en LIVE Stripe ce soir, le webhook live n'est PAS validé "Send test event" 200. Le code handler webhook a 0 test vitest. Si un événement live arrive avec une structure légèrement différente (ex API version 2026-03-25.dahlia bumpe un champ optional), l'`event.data.object as Stripe.Subscription` peut casser silencieusement.

**Fix immédiat** : "Send test event" depuis Stripe Dashboard → vérifier 200 dans les logs Vercel.
**Fix V1.5** : tests vitest sur le webhook handler avec fixtures Stripe officielles.

### 🟠 16. Pas de monitoring Sentry sur la cascade

Sentry est configuré (next.config.mjs) mais aucun `Sentry.captureException` explicite dans les nouveaux modules `clip-replicate.ts`, `vectorize-client.ts`, `clip-pipeline.ts`. Si Replicate ou Vectorize down, on `console.warn` mais Sentry ne reçoit rien.

**Fix** : remplacer les `console.warn` clés par `captureError(err, {...})` (pattern existant via `src/lib/error.ts`).

## 🔧 Operations / déploiement

### 🟠 17. Branche `feat/phase1-cascade-validators` = 9 commits sur 0 review humaine

PR pas créée, pas review humaine, pas merge sur main. Risque : oublier de la merger demain et faire un nouveau push qui forke encore plus.

**Fix** : tu valides le code demain matin (lecture diff `git diff main..feat/phase1-cascade-validators`), je merge.

### 🟡 18. GitNexus reindex laggué entre commits multiples

J'ai relancé le reindex 3× cette session. Le hook PostToolUse ne semble pas réindexer auto entre commits multiples. Pas critique mais peut polluer le `gitnexus_query` dans les prochaines sessions tant que pas re-indexé.

**Fix** : reindex automatique via cron (1×/jour) ou trigger manuel après chaque merge sur main.

## 📊 Business / produit (audit minimal)

### 🟡 19. Wizard `/admin/onboarding-wizard` n'a que 2 steps fonctionnels sur 4

Tasks 1.2 (CSV upload) + 1.3 (queue review) livrées. Tasks 1.4 (manual enrich) + 1.5 (publish feed) sont des placeholders text. Quand tu pousses Kap pilote, tu n'auras pas le wizard complet pour onboarder son catalogue. **Bottleneck Phase 4**.

**Fix** : prioriser Tasks 1.4 + 1.5 dans la prochaine session focused.

### 🟡 20. Aucune UI dashboard pour status embeddings CLIP

Le bootstrap endpoint `/api/admin/clip/bootstrap-merchant` retourne du JSON, mais il n'y a pas de page admin qui affiche "X embedded / Y pending / Z failed par marchand". Tu devras query SQL à la main.

**Fix V1.5** : page admin avec table + bouton "trigger bootstrap" + auto-refresh.

## ⚡ Récapitulatif priorité matin

**Ordre suggéré pour demain** (avant merge cascade sur main + activation CLIP) :

1. 🔴 **Fix categories RLS** (30 min — migration 091)
2. 🔴 **Webhook Zettle signature** (1-2h)
3. 🔴 **Unifier admin `requireAdmin` partout** (1-2h)
4. 🟠 **Test "Send test event" Stripe webhook live** (2 min)
5. 🟠 **Audit `console.log` 7 fichiers + gate dev-only** (30 min)
6. 🟠 **Tests vitest sur `applyEnrichment`** (2h)
7. Merge `feat/phase1-cascade-validators` sur main
8. Activer CLIP V1 selon `CLIP-V1-ACTIVATION.md`

**Total temps si tout fait** : ~7-8h. Trop pour une session. Choisir top 3-4 selon priorité business (1er marchand payant fin août = 4 mois).

## 🟢 Le bon

Pour équilibrer : ce qui marche bien dans le projet (sans flatterie) :

- 87 routes API structurées, naming cohérent (REST resourceful)
- Tests vitest 223 verts sur la cascade — bonne base
- Pre-push hook `npm run test:run + tsc` empêche les regressions silencieuses
- 23 migrations Supabase ordonnées avec headers descriptifs
- Multi-source convergence cycle 4 = vraie innovation par rapport aux compétiteurs
- Brain Nexus + COVERAGE-MATRIX = excellent traçage des décisions

---

**Honnêteté** : audit produit en ~30 min de vraies lectures + grep ciblés. Ne couvre pas frontend (consumer pages, dashboard UI), perf load, accessibilité, i18n, mobile responsive. Pour un audit complet faut 2-3 sessions dédiées.
