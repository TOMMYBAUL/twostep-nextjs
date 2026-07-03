# Maillon M3 — Enrichissement (photo / marque / catégorie / nom canonique)

> **Maillon de référence** (rédigé en premier pour verrouiller le template).
> Le plus chaud : cassé au 1er test réel (2026-06-27), corrigé (a→d), **e2e photo
> toujours non prouvé** (exige un env live).

## Rôle
À partir d'une **identité** (EAN/SKU, sortie de M2), produire les attributs vendeurs —
**photo, marque, catégorie FR, nom canonique** — via une cascade de sources hiérarchisées,
avec un **score de confiance** qui décide de la visibilité, **sans jamais inventer**.

## Contrat I/O
- **Entrée** : un produit avec une identité (EAN valide GTIN, ou SKU/nom), possiblement
  un nom marchand sale (« TSHIRT NOIR L », casse POS).
- **Sortie garantie** : `CascadeOutcome { score, tiers_matched[], canonical_ean,
  canonical_name, review_status: validated|pending|masked, visible }` +, sur le produit,
  `brand` (reconnue ou `null`), `category` (slug FR L1 ou `null`), `photo` (vérifiée ou
  absente). **Aucun champ n'est rempli d'une valeur devinée** : inconnu → `null`.

## Invariants nord (TESTÉS — pas des intentions)

1. **Seuils de publication déterministes.** `scoreToReviewStatus` (`score-cascade.ts:91`) :
   ≥ 0.95 → `validated` (visible feed), ≥ 0.70 → `pending` (queue 1-tap, invisible public),
   < 0.70 ou `null` → `masked`. `scoreToVisible` = `validated` uniquement.
   → *Prouvé par* `tests/enrichment/score-cascade*` (seuils + bornes).

2. **Jamais d'auto-promotion à 1.000.** `combineTierScores` (`:63`) plafonne à `SCORE_CAP =
   0.999` même en convergence multi-tiers. Un seul tier → score nominal ; 2+ → max + boost
   borné (`CONVERGENCE_BOOST_CAP = 0.05`).

3. **Garde de concordance d'identité (D7, zéro faux positif).** `buildCascadeOutcome`
   (`:132`, opt `identityConcords:false`) : si le nom résolu par la source NE concorde PAS
   avec le nom marchand (EAN mal saisi/réutilisé), un produit qui aurait été `validated` est
   **rétrogradé en `pending`** — jamais publié en silence.

4. **Marque : allow-list, jamais d'invention.** `extractKnownBrand` (`ean/brand.ts:97`) ne
   renvoie qu'une marque de `KNOWN_BRANDS` (~140), match **mot-entier** normalisé
   (« technike » ≠ Nike, « bulgari » ≠ LG). `resolveBrand` (`:116`) : source > nom résolu >
   nom marchand > `null`. → *Prouvé par* `tests/lib/ean/brand.test.ts` (7 marques réelles +
   adversarial substring + inconnue→null).

5. **Catégorie : traducteur allow-list vers 15 slugs FR L1, null sur inconnu.**
   `mapEanCategoryToFr` (`ean/category.ts:223`) ne peut émettre qu'un slug de `FR_L1_SLUGS`
   (`:36`, assert par test) ; idempotent si déjà FR ; inconnu/ambigu → `null` (l'IA remplira).
   → *Prouvé par* `tests/lib/ean/category.test.ts` (labels prod réels + ambigus→null + invariant
   « n'émet jamais un slug hors taxo »).

6. **La requête image n'utilise JAMAIS l'EAN brut.** `buildImageSearchQueries` (maillon 9 b) :
   cascade SKU≥4 → marque+nom+"product" → +"fiche produit" FR. Chercher 13 chiffres sur Google
   Images = bruit comparateurs = cause directe des 6/7 photos fausses. Ni nom ni marque → `[]`
   (pas d'image au hasard). → *Prouvé par* `tests/images-search-query.test.ts`.

7. **Vérif photo IA fail-CLOSED.** `verifyPhotoWithAI` : clé `ANTHROPIC_API_KEY` absente ou
   réponse vide → `false` (image écartée), **pas** `true`. Legacy fail-open derrière flag
   escaladé `PUBLISH_UNVERIFIED_IMAGES=1`. → *Prouvé par* `tests/images-verify-photo.test.ts`
   (6 paires réelles Carhartt→colle… → écartées, clé-absente→false, vide→false).

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| Clé IA vérif absente | **fail-closed** : 0 image publiée (pas de vérif = pas de publication) | `verifyPhotoWithAI` |
| Source EAN sans marque (EAN-Search) | marque récupérée du nom canonique, sinon `null` | `resolveBrand` |
| Catégorie source anglaise/inconnue | slug FR mappé, sinon `null` (jamais l'anglais verbatim) | `mapEanCategoryToFr` |
| EAN réutilisé / nom discordant | downgrade `validated`→`pending` | `buildCascadeOutcome` |
| Ni nom ni marque pour l'image | `[]` (pas de requête au hasard, pas de crédit gaspillé) | `buildImageSearchQueries` |
| Clés IA categorize (GROQ/GEMINI) absentes | catégorie AI inerte → fallback EAN mappé ou `null` (escaladé) | `categorize.ts` |

## Preuves exigées

- **Unit (fait, sans env)** : voir invariants 1-7 ci-dessus. 890→933 tests sur ce maillon.
- **PREUVE RÉELLE — MANQUANTE, escaladée.** La correctude d'une photo NE s'auto-certifie pas.
  Après un run d'enrichissement réel, produire un **rapport `EAN → nom/catégorie/marque/photo_url`**
  que **Thomas valide visuellement**. La boucle ne coche JAMAIS « photos OK » seule.
  → Exige **env live** (Serper/EAN-Search/ANTHROPIC + serveur + Supabase). La Routine cloud est
  « code+tests seulement » → **ne peut pas** le faire. Décision Thomas ouverte : upgrader l'env
  Routine (secrets + droit de lancer le pipeline) OU run supervisé (Thomas + Claude en session).

## Statut réel + dette connue

- **done (unit)** : (a) fail-closed vérif, (b) requête image sans EAN, (c) marque allow-list,
  (d) catégorie FR allow-list. `pipeline-state.md` step 9.
- **gated / non prouvé** : e2e photo sur vrais EAN (env live). C'est le trou de preuve n°1.
- **dette** : catégorie AI (`categorize.ts`) inerte en prod (clés GROQ/GEMINI absentes) → les
  mislabels source (Coca→home&garden) ne sont pas corrigés tant que l'IA ne tourne pas.
  Finding latent : `canonical_category` multi-source, aucun writer DB actif.

## Périmètre Fable 5

- **AUDITER** : confronter chaque invariant 1-7 au code ; **tenter de réfuter** — trouver une
  entrée qui publierait une marque/catégorie/photo fausse malgré la garde. Vérifier qu'aucun
  chemin d'écriture (POS sync, catalog/import, invoices/validate, wizard) ne contourne
  `applyEnrichment` (chemins jumeaux = classe de bug déjà rencontrée en (d)). Vérifier que le
  fail-closed vérif photo tient sur TOUS les callers d'écriture d'image.
- **CONSTRUIRE** : rien en pur ne reste. Le reste = **e2e photo réel** (env live, barre de
  preuve = rapport validé par Thomas) + **activer l'IA categorize** (poser les clés, escaladé).
