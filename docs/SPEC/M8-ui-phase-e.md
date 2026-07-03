# Maillon M8 — UI Phase E (écrans marchand honnêtes)

> Matcher chaque maillon fonctionnel à un écran **utilisable par un commerçant
> non-technicien**. Nord : **zéro cul-de-sac, zéro faux positif d'affichage** — un blip DB
> ne doit JAMAIS afficher « catalogue vide » à un marchand qui a des milliers de SKU.
> ⚠️ **La boucle n'a pas d'yeux** : elle prouve la LOGIQUE d'état ; le RENDU visuel/responsive
> reste à Thomas + Playwright.

## Rôle
Pour chaque écran marchand, dériver un **modèle de vue discriminé** honnête
(`loading | error | empty | ready`) via un helper PUR testé, que l'écran consomme — jamais
d'EmptyState sur chargement échoué, toujours une erreur `role="alert"` + Réessayer.

## Contrat I/O
- **Entrée** : état brut de fetch (`{ok, data|null}` ou `{loading, loadFailed, …}`).
- **Sortie garantie** : un modèle de vue à variantes explicites ; l'écran rend loading (squelettes),
  error (`role="alert"` + Réessayer), empty (CTA d'import), ready — **jamais de faux état rassurant**.

## Invariants nord (TESTÉS — pas des intentions)

Chaque écran = un helper pur + son test. Le pattern unique : **erreur de chargement ≠ vide**.

1. **E1 `deriveStatsView`** (`google/dashboard-view.ts`) : HTTP `!ok` ou `stats=null` → `error`
   (jamais « catalogue vide ») ; `total_visible ≤ 0` → `empty` (CTA import) ; suggestions ordonnées
   (photo → EAN → prix). *→ `tests/lib/google/dashboard-view.test.ts`.*
2. **E1 `deriveConnectionView`** : `error` lecture → `error` (un blip ne devient PAS une invitation à
   re-connecter). *idem test.*
3. **E2 `deriveReadinessView`** : trust `lfp_feed_ready` serveur (ne recalcule pas) → `ready` ;
   `ready` + `eligible_google=0` → `publishable=null` (jamais « vos 0 offres dépassent le seuil ») ;
   sinon `blocked` avec freins ordonnés (offres → connexion), jamais vide si `feed_ready=false`.
4. **E3 `deriveStockListView`** (`stock/stock-list-view.ts`) : `loadFailed` → `error` (≠ EmptyState =
   le faux cul-de-sac où un marchand réimporte en panique) ; `loading` prime ; distingue `empty`
   (rien importé) de `no-results` (recherche vide, porte de sortie). *→ régression testée.*
5. **E4 `deriveReviewView`** (`stock/review-view.ts`) : `loadError` → `error` prioritaire (jamais
   « rien à valider » trompeur — les fiches `pending_review` sont invisibles en vitrine, donc un
   marchand qui croit « rien à valider » ne validera jamais). Compteurs par bucket sûrs (hors-enum → pas de NaN).
6. **E5 `derivePosConnectionView`** (`stock/pos-connection-view.ts`) : `merchantFailed` → `error`
   (JAMAIS `redirect(/devenir-marchand)` qui éjecte un marchand onboardé) ; `connectionFailed` → `error`
   (≠ « aucune caisse » qui ferait un doublon) ; `productsCountFailed` → `null` (« — », jamais faux 0).
7. **ARIA transverse** : erreurs `role="alert"` ; readiness `role="status" aria-live="polite"` ; score
   `role="progressbar"` ; Réessayer toujours présent sur error.

## Modes d'échec attendus

| Écran | Blip DB / HTTP KO | Comportement EXIGÉ |
|---|---|---|
| E1 stats | HTTP !ok | `error` + Réessayer (jamais « vide ») |
| E1 connexion | error lecture | `error` (jamais « déconnecté ») |
| E3 stock | load KO | `error` (jamais EmptyState) |
| E4 review | load KO | `error` (jamais « rien à valider ») |
| E5 POS | marchand KO | `error` (jamais redirect qui éjecte) |
| E5 POS | connexion KO | `error` (jamais « aucune caisse ») |

## Preuves exigées
- **Unit (fait)** : 6 helpers purs 100 % testés (dont les régressions load-échoué→error≠empty).
  857→890 tests sur la phase E.
- **PREUVE VISUELLE — MANQUANTE, exige des YEUX (Thomas + Playwright)** : le jugement « pro vs moyen »,
  le responsive, la beauté, le focus management, `aria-live` réel. `scripts/ui-journey.mjs` (ariaSnapshot +
  screenshot, lecture-seule) est l'outil token-léger ; le verdict visuel reste humain. **La boucle ne
  tranche JAMAIS le visuel.**

## Statut réel + dette connue
- **done + testé (logique d'état)** : E1-E5, honnêteté au chargement + actions gated sur `res.ok`.
- **RESTE = rendu VISUEL/responsive de tous les écrans E** (Thomas + `ui-journey.mjs`) — c'est le
  gros du reste sur ce maillon.
- **dette** :
  - Tests purs unitaires n'exercent pas `aria-live` / focus (pas de RTL).
  - `auth.getUser()` double-destructure non gardée = **classe codebase-wide** (redirect login silencieux
    sur blip) — notée hors scope, séparée.

## Périmètre Fable 5
- **AUDITER** : réfuter « erreur ≠ vide » — trouver un écran marchand où un blip DB rend un état
  rassurant (EmptyState, redirect, faux 0) au lieu d'une erreur honnête. Vérifier que TOUTE action
  (validate, sync, disconnect) est gated sur `res.ok` (pas de faux succès + `router.refresh()`).
  Vérifier la garde `auth.getUser()` (classe codebase-wide).
- **CONSTRUIRE** : rien en pur ne reste. Le rendu VISUEL = Thomas/Playwright (pas Fable 5 sans yeux).
  Fable 5 PEUT préparer le durcissement de la classe `auth.getUser()`.
