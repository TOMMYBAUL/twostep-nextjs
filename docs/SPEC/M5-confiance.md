# Maillon M5 — Confiance / fraîcheur (affichage honnête)

> Traduit l'état DB en **affichage honnête** pour le consommateur. Nord : ne jamais
> mentir sur un stock — un retard de traitement ou une source faible se VOIT (« probable »),
> il ne se cache pas derrière un « Disponible » rassurant.

## Rôle
Résoudre l'état de stock affiché (`available | probable | out`) à partir de la **fraîcheur
réelle** (`source_ts`, pas `updated_at`) et de la **force de la source**, avec dégradation par
signalements consommateurs.

## Contrat I/O
- **Entrée** : `productConfidence({quantity, lastEventAt, storedSource?, posItemId, merchantHasIngest,
  recentNotInStoreReports, now?})`.
- **Sortie garantie** : `ProductConfidence{state, freshnessLabel, label, reason}` — `state ∈
  {available, probable, out}`, `freshnessLabel = "vu il y a X"` ou `null`.

## Invariants nord (TESTÉS — pas des intentions)

1. **Fraîcheur = `source_ts`, jamais `updated_at`.** `freshnessTs` (`product-confidence.ts` ~62) —
   un webhook traité avec 30 h de retard doit dire « probable » (vérité), pas « Disponible » (le
   mensonge d'`updated_at`). *→ `tests/ingest-maillon5-confidence-freshness.test.ts` (cas 30 h).*
2. **Plafonnage défensif `source_ts ≤ updated_at`.** Si `source_ts > updated_at` (back-fill migration
   104 / dérive d'horloge POS) → prendre le min. `product-confidence.ts` ~69.
3. **Limites de fraîcheur par force de source.** `FRESH_LIMIT_H` : realtime (webhook) = 24 h,
   snapshot (pos_sync/file_push) = 12 h ; au-delà → « probable ». `confidence.ts` ~32.
4. **Source `manual` plafonnée à « probable ».** Jamais « available », même frais/quantité haute. `confidence.ts` ~64.
5. **Quantité ≤ 2 → « probable ».** Zone d'erreur système (vol/casse/dernier exemplaire) → prudence. `confidence.ts` ~73.
6. **Dégradation par signalements.** `downgradeForReports` (`stock/reports.ts`) : ≥ 1 signalement →
   « probable », ≥ 3 → « out », fenêtre `REPORTS_WINDOW_H = 48 h`. *→ `tests/stock-product-confidence.test.ts`.*

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| `source_ts`/`updated_at` ISO malformé (NaN) | **fail-open** : prendre l'autre timestamp valide | `product-confidence.ts` ~65 |
| `storedSource` absent (ligne pré-104) | fallback `resolveSourceStrength(posItemId, merchantHasIngest)` | `product-confidence.ts` ~113 |
| `quantity` null | coerce `?? 0` → « out » | `product-confidence.ts` ~90 |
| `lastEventAt` null (jamais observé) | `ageMs=Infinity`, `state="probable"` (prudent), pas de label | `confidence.ts` ~80 |
| Signalements manquants (DB KO) | coerce `?? 0` → pas de dégradation (fail-open) | `product-confidence.ts` ~123 |

## Preuves exigées
- **Unit (fait, pur)** : tous les invariants sont unit-testables. Le test-clé
  `ingest-maillon5-confidence-freshness.test.ts` **prouve la divergence** (webhook +30 h : `updated_at`
  ment « Disponible », `source_ts` dit « probable »).
- **PREUVE RÉELLE** : sur un produit réel, comparer l'affichage à la réalité magasin. Ne peut se
  valider pleinement qu'avec un marchand pilote (est-ce que « probable » correspond au ressenti terrain ?).

## Statut réel + dette connue
- **done + testé** : fraîcheur honnête, limites par source, dégradation signalements.
- **dette** :
  - **Fallback `resolveSourceStrength` peut mentir** sur données pré-migration (produit POS ajusté à
    la main reste classé « realtime »). Mitigé par migration 104 + routes qui lisent `stock.source` réel.
  - **Fenêtre 48 h + seuils qty ≤ 2 = magic numbers** sans étude d'impact terrain (week-end fermé,
    boutique artisanale à petit stock → beaucoup de « probable »). À tuner sur données réelles.
  - **Pas de contexte produit** (high-velocity vs slow-mover ont les mêmes limites 24 h/12 h). Confidence V2 différée.

## Périmètre Fable 5
- **AUDITER** : réfuter « ne jamais mentir » — trouver un chemin où un stock périmé ou une source
  faible s'affiche « Disponible ». Vérifier que TOUTES les routes de lecture consomment `productConfidence`
  (pas de calcul de confiance ad hoc ailleurs) et lisent `stock.source`/`source_ts` réels.
- **CONSTRUIRE** : tuner les seuils sur données réelles (nécessite pilote) — pas un chantier code pur.
