# Checklist go-live pilote — onboarding marchand sur le feed Google LFP

> **But** : transformer « ce marchand est-il prêt à être poussé sur Google ? » en une checklist
> BINAIRE et en partie VÉRIFIABLE PAR LE LOGICIEL. C'est le dernier `[R]` boucle de la section
> READINESS (`docs/autonomy-priorities.md`) avant que la boucle signale « prêt — Deerskin + 2e
> boutique peuvent être onboardés ».
>
> Pilotes visés (Thomas, §1 priorities) : **Deerskin** + **une 2e boutique multimarque (neuf)** au
> centre de Toulouse. **PAS de revente/seconde-main** (pas de GTIN propre → casse le match Google).
>
> Dernière maj : **2026-06-23** (run autonome). Le **GO go-live reste à Thomas** (garde-fou dur).

---

## TL;DR — répartition des maillons

| Maillon | Qui | Vérifiable par |
|---|---|---|
| Catalogue ≥ 11 offres publiables | **Logiciel** (boucle) | `GET /api/google/stats` → `lfp_meets_offer_threshold` |
| Marchand connecté à Google Merchant | **Logiciel** | `GET /api/google/stats` → `google_connected` |
| Feed quotidien actif | **Logiciel** (déjà en prod) | cron `google-feed` (`0 3 * * *`, `vercel.json`) |
| **Readiness software globale** | **Logiciel** | `GET /api/google/stats` → **`lfp_feed_ready`** |
| Business Profile vérifié + lié au MC | **Externe** (marchand) | Google Business Profile / Merchant Center |
| « Request inventory verification » cliqué | **Externe** (marchand, dans Google MC) | Google Merchant Center |

> **La boucle ne peut prouver que les 4 premières lignes** (signaux observables). Les 2 dernières
> sont des actions côté Google que le marchand fait — la boucle ne les voit pas → elles restent
> sur cette checklist, à cocher par Thomas/le marchand.

---

## 1. Pré-requis SOFTWARE (la boucle les vérifie) — `GET /api/google/stats`

Authentifié en tant que le marchand, l'endpoint renvoie (champs ajoutés 2026-06-23) :

```jsonc
{
  "total_visible": 42,            // produits visibles + validés + non archivés + non variantes
  "eligible_google": 18,          // RÉELLEMENT publiables (= isFeedEligible : GTIN≥8 + prix>0 + image*)
  "missing_ean": 5, "missing_photo": 12, "missing_price": 2,
  "blocked_only_by_image": 9,     // EAN+prix OK, SEULE l'image manque (cible enrichissement image)
  "score": 43,                    // % publiable

  // ── Readiness LFP (source unique : src/lib/google/pilot-readiness.ts) ──
  "lfp_offers_threshold": 11,     // seuil Google LFP (LFP_MIN_PUBLISHABLE_OFFERS)
  "lfp_meets_offer_threshold": true,
  "lfp_offer_shortfall": 0,       // offres manquantes pour atteindre 11 (0 si atteint)
  "google_connected": true,
  "lfp_feed_ready": true,         // ← seuil atteint ET connecté
  "lfp_blockers": []              // ["below_offer_threshold","google_not_connected"] sinon
}
```

- [ ] **≥ 11 offres publiables** : `lfp_meets_offer_threshold === true`. Sinon, `lfp_offer_shortfall`
  dit combien il en manque, et `missing_*` / `blocked_only_by_image` disent quoi corriger (photo,
  code-barres, prix). `eligible_google` réutilise le VRAI gate du feed (`isFeedEligible`) — pas un
  proxy laxiste → le chiffre ne ment pas dans le sens flatteur (cf. D3, LESSONS).
- [ ] **Connecté à Google Merchant** : `google_connected === true` (le marchand a fait l'OAuth via
  `/dashboard/google` → bouton « Connecter à Google »).
- [ ] **`lfp_feed_ready === true`** = readiness SOFTWARE OK. C'est le signal unique à regarder.

> **Parité tier GTIN-only** : si `GOOGLE_GTIN_ONLY_TIER=1` (flag D2, OFF par défaut — activation =
> GO Thomas au 1er pilote), `eligible_google`/`lfp_feed_ready` comptent AUSSI les produits GTIN+prix
> sans image (Google enrichit depuis le GTIN), exactement comme le feed réel. Le KPI suit le flag
> dans les deux états (revue SF-hunter 2026-06-23) → pas de faux « pas prêt » au go-live.

## 2. Feed quotidien (déjà en prod — rien à faire)

- [x] Cron `google-feed` actif (`vercel.json`, `0 3 * * *` = 03:00 UTC quotidien) → pousse le feed
  Voie A (Content API) pour chaque marchand connecté. Temps réel en plus via webhooks POS.
- [x] Cron `google-status` (`0 6 * * *`) relit les statuts produits Google et remonte les rejets
  (`quality_alerts google_disapproved` si `GOOGLE_DISAPPROVAL_ALERTS=1`, sinon Sentry).
- [x] Voie B (feed XML crawlé) : `GET /api/feed/lfp/[merchantId]` — parité d'ensemble avec Voie A.

## 3. Pré-requis EXTERNES (côté marchand, dans Google — la boucle NE les voit PAS)

Conditions Google LFP, à faire/vérifier côté compte du marchand :

- [ ] **Google Business Profile vérifié** pour la boutique physique (adresse réelle, horaires).
- [ ] **Business Profile lié au Merchant Center** (le store_code Two-Step doit correspondre au
  magasin LFP — cf. `src/lib/google/store-code.ts`, source unique `resolveStoreCode`).
- [ ] **Bouton « Request inventory verification »** cliqué dans Google Merchant Center (déclenche la
  vérification du stock en magasin → prérequis du statut Trusted). C'est une action DANS Google MC,
  pas un bouton de notre app.
- [ ] **≥ 11 offres avec GTIN** côté feed (couvert par le maillon §1, mais Google le revérifie).

## 4. Pré-requis OPÉRATIONNELS (Thomas)

- [ ] `INSEE_API_TOKEN` réglé en prod **avant** d'ouvrir l'inscription à un vrai marchand
  (sinon `verifySIRET` fail-open → SIRET non vérifié, cf. merge-readiness §3 + LESSONS).
- [ ] Onboarding du marchand : caisse connectée OU import fichier/email → catalogue ingéré, stock à
  jour (chaîne data A, maillons 1→8 prouvés).
- [ ] Validation visuelle du parcours (chantier B — pas de navigateur côté boucle).

---

## Séquence go-live (ordre)

1. Onboard le marchand (POS connecté ou import) → catalogue + stock dans l'app.
2. Enrichir jusqu'à `lfp_meets_offer_threshold === true` (≥ 11 offres publiables ; viser le
   `blocked_only_by_image` en priorité = enrichissement image).
3. Marchand connecte Google (`/dashboard/google`) → `google_connected === true`.
4. Vérifier `lfp_feed_ready === true` sur `GET /api/google/stats`.
5. Marchand : Business Profile vérifié + lié au MC + clic « Request inventory verification ».
6. Le cron `google-feed` pousse automatiquement le lendemain 03:00 UTC ; vérifier `google-status`.
7. Répéter pour la 2e boutique → 5 marchands vérifiés = seuil **Trusted** Google LFP.

---

### Hors périmètre boucle (Thomas / externe)
- 🔒 **GO go-live** (pousser un vrai marchand) — décision Thomas.
- 🔒 **Actions Google côté marchand** (BP, MC, inventory verification).
- 🔒 **Candidature/coordination LFP** (tickets Google, cf. `google-lfp-preparation-v2.md`).
- 🔒 **Validation visuelle UI** (pas de navigateur côté boucle).
