# Merge-readiness — `feat/pipeline-v1-handoff-2026-06-12` → `main`

> **But** : transformer « est-ce mûr ? » en une **checklist binaire** pour merger +
> déployer sans casse. Rang 0 du backlog (`docs/autonomy-priorities.md`). Mise à jour à
> chaque run autonome où l'état change. Le **GO du merge reste à Thomas** (garde-fou dur,
> `AUTONOMY.md §2`).
>
> Dernière maj : **2026-06-20** (run autonome). Branche : **84 commits d'avance sur `main`**.
> Gate : `npm run test:run` = **454 verts**, `tsc --noEmit` = **OK**.

---

## TL;DR décision

| Question | Réponse |
|---|---|
| Le code est-il mergeable **sans casser la prod** ? | **OUI** — tout est additif ; migrations prod déjà à jour (105) ; 106 inerte sans flag. |
| Reste-t-il un **bloquant dur** au merge ? | **NON côté software.** Le seul bloquant est la **validation visuelle UI** (Thomas) + le **GO humain**. |
| Faut-il appliquer une migration **avant** de merger ? | **NON.** La seule non-appliquée (106) est gated derrière un flag OFF → inerte. |
| Des clés prod manquent-elles ? | **OUI, non bloquantes** (dégradations, pas crash) — sauf **INSEE** (fail-open SIRET, à corriger). Voir §3. |

**Recommandation** : merge + deploy possible dès la validation visuelle UI. Régler `INSEE_API_TOKEN`
(sécurité onboarding) idéalement **avant** d'ouvrir l'inscription à un vrai marchand.

---

## 1. Migrations — code vs prod (vérifié live via Supabase MCP, 2026-06-20)

Projet prod : `nagyprzjtheyeuuwxgpg` (twostep, eu-north-1, ACTIVE_HEALTHY).

- ✅ **Appliquées en prod jusqu'à `105_quality_alerts_pos_disconnected`** (vérifié `list_migrations`).
  Inclut toute la chaîne pipeline récente : 100 (enrichment_jobs), 101 (ingest_lock),
  102 (quality_alerts_ingest), 103 (google_feed_status_partial), 104 (stock_source_tracking),
  105 (pos_disconnected).
- ⏸️ **`106_quality_alerts_google_disapproved` : NON appliquée** — **volontaire** (gated).
  Le cron `google-status` n'écrit cette table **que si `GOOGLE_DISAPPROVAL_ALERTS=1`** ; sans le
  flag, l'INSERT n'est jamais tenté → **aucune dépendance au merge**. (Escaladé : option A appliquer
  106+flag vs B Sentry-only — cf. worklog 2026-06-20.)
- ✅ Toutes les migrations du dépôt sont **idempotentes** (protocole `AUTONOMY.md §4`) → rejouables sans casse.

**Conclusion migrations** : le merge **n'exige aucune migration**. La prod est déjà au niveau requis
par le code (106 exclue car inerte).

## 2. Gate de tests / typecheck

- ✅ `npm run test:run` (sans réseau, `tests/db/**` exclus) : **454 / 454**.
- ✅ `tsc --noEmit` : OK.
- ✅ Hook pre-push déterministe actif (tests + tsc) — push rouge bloqué.
- ⚠️ `npm run test:db` (tests live DB, réseau) **à lancer en CI** — non inclus dans le gate local
  (isolé à cause de l'interception TLS, cf. LESSONS NetLimiter/Norton).

## 3. Variables d'environnement prod (Vercel)

### ✅ Présentes (vérifié audit 2026-06-12, inchangé)
SERPER, EAN_SEARCH, REPLICATE, CLOUDFLARE_API_TOKEN+VECTORIZE, GROQ, RESEND,
CF_EMAIL_WEBHOOK_SECRET (email entrant `factures-{slug}@` actif), Upstash, Stripe (3 price IDs),
**CRON_SECRET** (requis par tous les crons, dont `google-feed`/`google-status`), env Google OAuth.

### ⚠️ Absentes — dégradations, **non bloquantes au merge**
| Clé | Effet en prod si absente | Gravité |
|---|---|---|
| `INSEE_API_TOKEN` | **`verifySIRET` fail-open** : tout SIRET à 14 chiffres passe sans contrôle (lib/siret.ts) | 🔴 **à régler avant 1er marchand réel** |
| `ANTHROPIC_API_KEY` | fallback parser factures + haiku-product-meta morts | 🟡 |
| `GEMINI_API_KEY` | fallback parser Gemini mort | 🟡 |
| `UPCITEMDB_API_KEY` | un tier de lookup EAN inactif | 🟡 |
| `KICKSDB_API_KEY` | lookup sneakers inerte (clé FREE gratuite) | 🟢 |
| `GS1_CODEONLINE_API_KEY` | tier GS1 inactif (clé attendue ~2026-06-22) | 🟢 |
| `STRICT_DECRYPT` | non activé = **volontaire** (rollout 5 phases, bloqué par 1 token legacy Square du compte test) | ⏸️ |

> Aucune de ces absences ne **casse** le déploiement (le code dégrade proprement). `INSEE` est
> le seul à enjeu sécurité réel (onboarding). Détail : `session-handoff §7bis`.

## 4. Crons (`vercel.json`) — actifs **après** déploiement

10 crons déclarés : `enrich-ean` (0 */2), `google-feed` (0 3), **`google-status` (0 6, NOUVEAU)**,
`cleanup` (0 4), `health` (*/5), `closing-reminders` (*/15), `pos-resync` (0 */6),
`quality-check` (0 5), `enrich-products` (*/5), `images/process` (*/10).
Tous gardés par `CRON_SECRET` (présent en prod ✅). Aucun n'a d'effet avant le déploiement du nouveau code.

## 5. e2e / preview

- ✅ Preview Vercel déployé + **e2e ingestion 16/16 vert (2026-06-13)** :
  `scripts/e2e-ingest-preview.mjs` (marchand jetable → push CSV mixte → triage/REPLACE/401 → cleanup).
- ⚠️ **À re-jouer** : l'e2e date du 2026-06-13, **84 commits** se sont accumulés depuis. Le rejouer
  sur une preview à jour fait partie du Rang 0 (« e2e de bout en bout »). Non bloquant pour le merge,
  mais **recommandé avant deploy prod**.

## 6. Points de rollback

- **Code** : `git revert` (branche-only, jamais en force) — tout changement de la branche est réversible.
- **Migrations** : 106 non appliquée → rien à annuler. Les 100-105 sont idempotentes + ont un rollback
  commenté en tête (protocole §4). En cas d'incident, revert applicatif suffit (additif).
- **Flags** : `GOOGLE_DISAPPROVAL_ALERTS` (OFF par défaut) — bascule réversible sans redeploy code.

## 7. Séquence de déploiement recommandée (GO Thomas requis)

1. **Valider le rendu visuel UI** (chantier B : wizard import, badge confiance, signaler, alertes qualité).
2. (Optionnel mais recommandé) **Re-jouer l'e2e** sur preview à jour.
3. **Régler `INSEE_API_TOKEN`** en prod (sécurité SIRET) — idéalement avant ouverture marchand.
4. **Merge** `feat/pipeline-v1-handoff-2026-06-12` → `main` (gate vert obligatoire).
5. **Deploy** prod. Vérifier les crons (logs Vercel) + `/api/health`.
6. (Différé/gated) décider de l'option A/B pour 106 + `GOOGLE_DISAPPROVAL_ALERTS`.

---

### Ce qui reste **hors périmètre boucle** (Thomas / externe)
- 🔒 **GO merge + deploy** (irréversible) — garde-fou dur.
- 🔒 **Validation visuelle UI** (pas de navigateur côté boucle).
- 🔒 **Clés prod** (INSEE/ANTHROPIC/GEMINI/UPCITEMDB/KICKSDB/GS1) + `STRICT_DECRYPT` (set Vercel).
- 🔒 **Candidature Google LFP** (limbo) — débloque le produit, indépendant du merge.
