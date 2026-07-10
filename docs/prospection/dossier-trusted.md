# Dossier Trusted Google LFP — checklist des 5 marchands vérifiés

> Créé le 2026-07-10 (item P1-5). **But** : suivre, marchand par marchand, les prérequis du
> statut **Trusted** (= 5 marchands vérifiés) et savoir à tout instant « combien il en manque
> et pourquoi ». La partie observable est **programmatique** :
> `src/lib/google/trusted-readiness.ts` (`evaluateTrustedMerchant` / `evaluateTrustedDossier`,
> 21 tests, revue silent-failure-hunter SOUND + 2 findings corrigés) — la même logique que le
> futur écran/rapport, pas un comptage manuel.

## Les prérequis (source : mails Google avril 2026 + `google-lfp-preparation-v2.md`)

Par marchand, TROIS familles de conditions :

| # | Condition | Qui la voit | Signal |
|---|---|---|---|
| 1 | **> 11 offres publiables** (GTIN, prix, image… = le vrai gate du feed) | ✅ La boucle | `summarizePublishability().publishable` ≥ 11 (`evaluateFeedReadiness`, seuil `LFP_MIN_PUBLISHABLE_OFFERS`) |
| 2 | **Connexion Google Merchant active** | ✅ La boucle | `google_merchant_connections` existe |
| 3 | **Feed quotidien sain** | ✅ La boucle | `last_feed_status = 'success'` ET `last_feed_at` ≤ 30 h (`DAILY_FEED_MAX_AGE_HOURS` : 24 h de cadence + 6 h de marge). ⚠️ `last_feed_at` = heure de TENTATIVE → un `partial`/`error` frais ne compte PAS |
| 4 | **Business Profile vérifié** par Google | ❌ Externe | Attestation Thomas (`attested.gbpVerified`) |
| 5 | **Business Profile LIÉ au Merchant Center** | ❌ Externe | Attestation Thomas (`attested.gbpLinkedToMc`) |
| 6 | **« Request inventory verification » demandé** dans le MC | ❌ Externe | Attestation Thomas (`attested.inventoryVerificationRequested`) |

**Règles du helper (anti-faux-positif, testées)** : attestation manquante/sale = `false`
(fail-closed) ; timestamp illisible OU futur au-delà de 15 min de skew = `feed_timestamp_invalid`
(donnée corrompue ≠ frais) ; doublon de marchand compté UNE fois et **le pire état gagne** (une
ligne périmée « prête » ne masque jamais l'état réel cassé) ; `publishable` aberrant normalisé
à 0. Un marchand n'est « prêt » que si TOUT est vert.

## Checklist par marchand (à remplir au fil des onboardings)

Modèle à dupliquer — les lignes 1-3 se lisent dans le dashboard (`/dashboard/google`) ou en DB,
les lignes 4-6 sont les actions externes du runbook (`runbook-onboarding-pilote.md`, phases 5-6).

### Marchand 1 : ______________ (candidat : Deerskin)
- [ ] 1. ≥ 11 offres publiables (vu : ____ offres le ____)
- [ ] 2. Connexion Google Merchant active
- [ ] 3. Feed quotidien en `success` depuis ≥ 3 jours consécutifs
- [ ] 4. GBP vérifié (fiche Google Business Profile au nom de la boutique)
- [ ] 5. GBP lié au Merchant Center (MC 5755722759 ou compte du marchand)
- [ ] 6. « Request inventory verification » cliqué dans le MC
- Notes (adresse, contact, caisse, date onboarding) : ______________

### Marchand 2 : ______________ (candidat : 2e multimarque neuf centre Toulouse)
*(mêmes 6 cases)*

### Marchands 3-5 : ______________
*(mêmes 6 cases — viser des catégories variées : mode/chaussures/bijou pour montrer la largeur)*

## Roll-up

- **Prêts : __ / 5** — dès 5/5 : demander le passage **Trusted** en répondant sur les tickets
  Google **5-9519000040422 / 6-7242000040976** (contact gTech, MC 5755722759) avec la liste des
  5 marchands + leurs store_codes.
- Rappels d'état avril 2026 (vérifiés) : la revue se fait EN PARALLÈLE du recrutement, l'email
  vaut candidature formelle, la vérification se fait à distance par sondage, et l'inventaire
  peut être poussé via Content API AVANT le statut Trusted → onboarder sans attendre Google.

## Brancher le programmatique (quand les marchands arrivent)

Le helper est PUR : il attend par marchand `{publishable, googleConnected, lastFeedAt,
lastFeedStatus, attested{...}}`. Consommation prévue (à câbler au moment utile, pas avant) :
un rapport admin ou un script type `scripts/` qui lit `google_merchant_connections` +
`summarizePublishability` et croise avec les attestations tenues ICI (ce fichier = source des
cases 4-6). Tant qu'il y a 0 marchand réel, ce fichier suffit — ne pas construire d'UI d'avance.
