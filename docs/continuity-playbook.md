# Continuity Playbook — Two-Step

> Version : 1.0 — 2026-04-25
> Destinataires : Thomas Bauland (owner) / frère / 1 tiers de confiance (à désigner)
> Objectif : permettre au frère + 1 tiers de reprendre la main sans connaissance préalable du code.

---

## 1. Accès credentials chiffrés (Bitwarden Family)

**Action manuelle Thomas (Phase 0)** : créer un compte Bitwarden Family, configurer une clé d'urgence, inviter le frère et le tiers comme membres avec accès aux coffres ci-dessous.

| Coffre Bitwarden | Service | Accès requis |
|---|---|---|
| `twostep-vercel` | Vercel — deploy + env vars | dashboard vercel.com / token CLI |
| `twostep-supabase` | Supabase projet `nagyprzjtheyeuuwxgpg` | dashboard + service_role key |
| `twostep-stripe` | Stripe live + test | dashboard + webhook secret |
| `twostep-cloudflare` | R2 bucket `twostep-images` + Vectorize | dashboard + API token |
| `twostep-hetzner` | VPS rembg `195.201.229.146:7000` | SSH key + root password |
| `twostep-infomaniak` | Domaine `twostep.fr` + email `bauland@twostep.fr` | dashboard Infomaniak |
| `twostep-anthropic` | Anthropic API (Claude Haiku + Vision) | API key |
| `twostep-resend` | Email transactionnel Resend | API key |
| `twostep-sentry` | Monitoring erreurs Sentry | DSN + auth token |
| `twostep-pennylane` | Pennylane PDP (à souscrire Phase 0) | identifiants à créer |
| `twostep-inngest` | Inngest free tier (Phase 1) | API key + signing key |
| `twostep-github` | GitHub `TOMMYBAUL/twostep-nextjs` + `TOMMYBAUL/twostep-brain` | PAT avec accès repo |

**Règle** : aucun secret en clair dans ce fichier, dans les commits, ni dans Slack/email.

---

## 2. Runbook redémarrage prod

À exécuter dans l'ordre si la prod est inaccessible ou les paiements échouent.

### Étape 1 — Vercel
```bash
# Dashboard : https://vercel.com/dashboard
# Ou CLI :
vercel inspect <deployment-url>
```
Vérifier que le dernier deploy est `Ready`. Si `Error` : consulter les build logs, re-deploy depuis le dashboard (`Redeploy`).

### Étape 2 — Supabase
Dashboard : https://supabase.com/dashboard/project/nagyprzjtheyeuuwxgpg

Vérifier que le projet n'est pas en statut `Paused` (plan gratuit auto-pause après 7 jours d'inactivité). Si paused : bouton `Restore project` dans le dashboard.

### Étape 3 — Migrations DB
Dans le dashboard Supabase → SQL Editor, vérifier que la dernière migration listée dans `supabase/migrations/` du repo correspond au dernier fichier appliqué. En cas de dérive : appliquer manuellement via `supabase db push` (CLI) ou copier-coller le SQL dans le dashboard.

### Étape 4 — Stripe webhook + pricing
Dashboard : https://dashboard.stripe.com/webhooks

Vérifier que le webhook `https://twostep.fr/api/stripe/webhook` est actif (statut `Enabled`). Vérifier qu'il existe un prix à `2500` centimes (25 € pionnier) en mode live. Si manquant : recréer via dashboard Stripe → Products.

### Étape 5 — Cloudflare R2
Dashboard : https://dash.cloudflare.com → R2 → bucket `twostep-images`

Vérifier que le bucket est accessible et que les règles CORS sont en place (lire `src/lib/r2.ts` pour le détail).

### Étape 6 — Hetzner rembg
```bash
curl http://195.201.229.146:7000/health
# Réponse attendue : {"status":"ok"} ou HTTP 200
```
Si le service est down : se connecter en SSH (clé dans Bitwarden `twostep-hetzner`) et redémarrer :
```bash
cd /opt/rembg && docker compose restart
```

### Étape 7 — Health check composite
```bash
curl https://twostep.fr/api/health
# Réponse attendue : {"supabase":"ok","r2":"ok","rembg":"ok"}
```
Si un service répond `degraded` ou `error` : recommencer l'étape correspondante ci-dessus.

### Étape 8 — Feed LFP
```bash
curl https://twostep.fr/api/feed/lfp/<merchant_slug>.xml
# Réponse attendue : XML RSS valide avec au moins 1 item
```
Si 404 ou XML vide : vérifier que le marchand a `lfp_enabled = true` dans Supabase table `merchants`.

---

## 3. Contacts critiques

| Service | Contact | Sujet | SLA |
|---|---|---|---|
| Google LFP | Aftab Khan (gTech specialist) | Tickets `5-9519000040422` + `6-7242000040976` — survey Trusted | 5-15 j |
| Avocat | (à désigner Phase 0) | CGU + DSA + photos + ODbL — pack estimé `3 900-7 050 €` HT | 3-4 sem |
| RC Pro / Cyber | Stello ou Orus (à souscrire Phase 0) | Sinistre + **clause incapacité temporaire** — demander explicitement | 24 h |
| Comptable | (à désigner Phase 0) | TVA + Factur-X + Pennylane | hebdomadaire |
| Vercel support | dashboard vercel.com → Support | Deploy / runtime errors | dépend du plan |
| Supabase support | dashboard → Support | DB issues / RLS / migrations | dépend du plan |
| Stripe support | dashboard.stripe.com → Help | Paiements / disputes / webhooks | < 24 h |

**Action manuelle Thomas** : compléter les lignes "à désigner" et mettre les contacts dans Bitwarden note sécurisée `twostep-contacts-critiques`.

---

## 4. Procédure incapacité Thomas (> 5 jours)

Déclencher si Thomas ne répond plus aux messages pendant 48 h ou annonce une indisponibilité.

1. **Frère prend contrôle Bitwarden** via la clé d'urgence (configurée par Thomas à l'avance).
2. **Email pause à tous les marchands payants actifs** :
   > "Bonjour, Thomas est temporairement indisponible. Le service continue de fonctionner normalement. Support réduit — réponse sous 72 h max. Retour prévu le [date]. Merci de votre compréhension."
3. **Suspendre toute prospection** : aucun nouvel email de démarchage, aucun envoi vers la liste de prospects.
4. **Ne pas contacter Aftab Khan (Google)** tant que Thomas n'est pas disponible pour répondre en continu — si Aftab envoie un email, répondre :
   > "Thomas est temporairement indisponible. Il reprend contact le [date]. Les surveys seront planifiés à son retour."
5. **Gestion support minimale** : répondre aux tickets > 24 h en s'appuyant sur la FAQ et les scripts email types (cf. `docs/runbook-support-marchand.md` — à créer Phase 4).
6. **Si > 30 jours d'absence** :
   - Envoyer un email "pause produit" à tous les marchands payants.
   - Rembourser au prorata les abonnements actifs via Stripe dashboard → Subscriptions → `Refund`.
   - Afficher une bannière sur `twostep.fr` ("Service en pause temporaire — retour prévu [date]").

---

## 5. Gate Phase 5 — Rappel

Avant que Thomas prenne > 5 jours de vacances : **le frère doit avoir réussi 1 onboarding marchand complet seul** (CSV import → produits visibles dans le dashboard → feed LFP généré).

Si ce gate n'est pas passé → repousser les vacances. Pas d'exception.

---

## Self-review

- [x] Sous 3 pages (~150 lignes)
- [x] Aucun secret en clair
- [x] Pas de contact privé exposé
- [x] Services Two-Step couverts : Vercel, Supabase, Stripe, Cloudflare R2, Hetzner rembg, Infomaniak, Anthropic, Resend, Sentry, Pennylane, Inngest, GitHub
- [x] Runbook actionnable sans connaissance préalable du code
