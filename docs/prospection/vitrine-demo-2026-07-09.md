# Vitrine démo « Maison Garonne » — générée par le PIPELINE RÉEL (P1 6a.2)

> Run autonome 2026-07-09. Remplace les boutiques démo hand-fakées : ce marchand est passé
> par le VRAI chemin sans-caisse (jeton → `POST /api/ingest/stock` → triage → identité →
> file `enrichment_jobs` → worker cron → cascade D7 → visibilité). **Le jugement visuel
> final reste à Thomas** — la boucle certifie la DATA, pas le rendu.

## Où la voir

- **Dev local / preview branche** : `http://localhost:3000/shop/maison-garonne-762ad7a0`
  (⚠️ en PROD twostep.fr l'app conso est gatée `/bientot` depuis le hotfix du 07/07 —
  la vitrine se juge sur le dev/preview de la branche).
- Dashboard marchand : compte `demo-vitrine@twostep.fr` (user + marchand `launch_cohort=999`,
  convention démo du seed).
- `merchant_id` : `762ad7a0-1f9f-427d-ae96-b1c29c912b1c`.

## Comment elle a été produite (rejouable)

```
node scripts/demo-vitrine-pipeline.mjs http://localhost:3000            # créer + pousser + enrichir + rapport
node scripts/demo-vitrine-pipeline.mjs http://localhost:3000 --report   # rapport seul
node scripts/demo-vitrine-pipeline.mjs http://localhost:3000 --cleanup  # tout supprimer
```

Catalogue : **19 EAN RÉELS vérifiés sur Open Beauty Facts le 09/07** (marques FR : Nuxe,
Caudalie, Klorane, Weleda, Bioderma, La Roche-Posay, Avène, L'Occitane) + 2 lignes SKU-only
volontaires (bougie, tote bag) pour montrer le triage honnête. Poussé en CSV `;` par la voie
jeton (le wedge caisses FR fermées).

## Résultat (état DB au 09/07, après le fix « photo convergée »)

`{"total":21,"visibles":19,"validated":19,"pending":0,"avec_photo":20}`

| EAN | Nom déclaré | Marque | Catégorie | Score | Review | Visible | Photo |
|---|---|---|---|---|---|---|---|
| 3282770204681 | Avène Cicalfate Crème réparatrice 100 ml | Avène | beaute | 0.985 | validated | OUI | ean |
| 3282770139204 | Avène Cleanance gel nettoyant 200 ml | Avène | beaute | 0.985 | validated | OUI | ean |
| 3401528520846 | Bioderma Huile de douche 1 L | Bioderma | beaute | 0.985 | validated | OUI | ean |
| 3401578653709 | Bioderma Sébium gel moussant 200 ml | Bioderma | beaute | 0.985 | validated | OUI | ean |
| — | Bougie artisanale Garonne cire de soja 180 g | ∅ | maison-deco | 0 | masked | non | ∅ |
| 3522930003595 | Caudalie Soin des lèvres | Caudalie | beaute | 0.985 | validated | OUI | ean |
| 3522931033614 | Caudalie Vinotherapist Crème réparatrice mains… | Caudalie | beaute | 0.985 | validated | OUI | ean |
| 3282770141436 | Klorane Après-shampoing Quinine & Edelweiss 200 ml | Klorane | beaute | 0.985 | validated | OUI | ean |
| 3282770141252 | Klorane Shampooing 200 ml | Klorane | beaute | 0.985 | validated | OUI | ean |
| 3253581768648 | L'Occitane Crème Mains Karité 150 ml | ∅ | beaute | 0.985 | validated | OUI | ean |
| 3253581285886 | L'Occitane Stick lèvres ultra riche | L'Occitane en Provence | beaute | 0.985 | validated | OUI | ean |
| 3337875863377 | La Roche-Posay Effaclar Duo+ 40 ml | La Roche-Posay | beaute | 0.985 | validated | OUI | ean |
| 3337875696548 | La Roche-Posay Lipikar Baume AP+M 400 ml | La Roche-Posay, loreal | beaute | 0.985 | validated | OUI | ean |
| 3264680011016 | Nuxe Huile prodigieuse 100 ml | Nuxe | beaute | 0.985 | validated | OUI | ean |
| 3264680028878 | Nuxe Lait solaire fondant SPF50+ 150 ml | Nuxe | beaute | 0.985 | validated | OUI | ean |
| 3264680004964 | Nuxe Men gel douche multi-usages 200 ml | Nuxe | beaute | 0.985 | validated | OUI | ean |
| 3264680004117 | Nuxe Stick lèvres hydratant | Nuxe | beaute | 0.985 | validated | OUI | ean |
| — | Tote bag Maison Garonne coton bio | ∅ | mode | 0 | masked | non | serper ⚠️ |
| 3596206529621 | Weleda Bébé Calendula Crème pour le change 75 ml | Weleda | enfants | 0.985 | validated | OUI | ean |
| 3401360104631 | Weleda Déodorant roll-on 24h 50 ml | WELEDA | beaute | 0.985 | validated | OUI | ean |
| 3596200077555 | Weleda Skin Food texture légère 30 ml | Weleda | beaute | 0.985 | validated | OUI | ean |

**Ce que ça prouve en réel** : convergence multi-source P0-10 VIVANTE (19/19 à 0.985 =
tier2 OBF + tier6 EAN-Search, auto-validés par D7) ; triage honnête (2 sans-EAN → masked,
rien ne s'auto-publie) ; photos GTIN-keyées OBF réelles appliquées (après le fix « photo
convergée » de ce run — avant lui : 0 photo sur 19, bug prouvé puis fermé + 13 tests).

## À juger par Thomas (la boucle ne peut pas)

1. **Rendu vitrine** (pixels, responsive) : `/shop/maison-garonne-762ad7a0` sur dev/preview.
2. **Justesse VISUELLE des 19 photos** (rapport ci-dessus = URLs OBF ; la boucle ne coche
   jamais « photos OK » seule). Toutes `photo_source=ean` (GTIN-keyées, flag #12 OFF).
3. Cosmétique data : marque brute `La Roche-Posay, loreal` (chaîne OBF non nettoyée),
   `WELEDA` en capitales, 1 marque manquante (L'Occitane crème mains) — corrigeable en
   review dashboard, ou candidat allow-list `brand.ts` au prochain run.
4. Pas de photo de couverture boutique (photo_url marchand NULL) — à poser à la main si
   la vitrine sert au démarchage.

## ⚠️ Découverte collatérale (escaladée, décision #14)

La photo `serper` du tote bag n'a PAS été posée par le code de la branche : le **cron
`enrich-products` de la PROD Vercel** (toutes les 5 min, code `main` d'AVANT le fix
fail-closed du 27/06 : `if (!apiKey) return true`) a saisi 1 des 21 jobs dans la DB
partagée et a publié une image Google Images **non vérifiée** (photo d'un site tiers).
Preuve : 21 jobs, mes 2 passes worker = 20 traités ; `[serper]` absent des logs dev ;
`origin/main:src/lib/images/serper.ts` porte le fail-open. Tant que main n'est pas
re-mergé (ou la clé ANTHROPIC posée en prod, ou le cron prod coupé), **tout produit
sans EAN poussé dans la DB partagée peut recevoir une fausse photo en ≤ 5 min** —
la classe exacte du « 6/7 photos fausses » du 27/06, encore vivante en prod.
