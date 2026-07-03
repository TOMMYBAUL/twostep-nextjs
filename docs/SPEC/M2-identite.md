# Maillon M2 — Identité (EAN / SKU)

> Décide **qui est quoi** avant tout enrichissement. Règle nord : **le nom seul n'est
> JAMAIS une identité** — un EAN faux ou un match par nom = mauvais produit publié = faux
> positif n°1.

## Rôle
Classer chaque ligne stock en identité **forte** (GTIN validé par checksum, enrichissable
globalement) ou **faible** (SKU interne), rejeter le reste avec motif, et matcher un candidat
aux produits existants par priorité stricte.

## Contrat I/O
- **Entrée** : `ParsedInvoiceItem[]` (triage) ; `Candidate{posItemId?,ean?,sku?,name?}` + index (match) ;
  code brut (validation).
- **Sortie garantie** : `TriageReport{accepted, gtin_lines, sku_lines, rejected_lines, rejected_samples}` ;
  `MatchResult{productId, matchType: ean|sku|name}` ou `null` (→ create) ; EAN canonique normalisé ou `null`.

## Invariants nord (TESTÉS — pas des intentions)

1. **Checksum GTIN obligatoire.** `isValidGtinChecksum` (`ean/validate.ts`) — algo GS1 poids 3/1 ;
   détecte 8/12/13/14 ; invalide → `null`. *→ `tests/lib/identifiers/validators.test.ts`.*
2. **UPC-12 → EAN-13 canonicalisé** (`"0"+upc12`) → même GTIN que le POS (cohérence cross-canal).
3. **EAN au checksum faux → traité en SKU, JAMAIS envoyé aux lookups GTIN.** `triage.ts` ~96 —
   empêche d'identifier un produit sur un code faux. *→ `tests/ingest-maillon2-triage.test.ts`.*
4. **Promotion SKU→GTIN** : si la colonne SKU/référence porte un GTIN valide, promue en identité
   forte, SKU vidé (pas de doublon). `triage.ts` ~83.
5. **SKU exploitable = regex stricte** `^[A-Za-z0-9][A-Za-z0-9 ._/#+-]{2,31}$` (PLU « 4011 » valide,
   « ab » non). `isExploitableSku` `triage.ts` ~57.
6. **Nom seul JAMAIS une identité.** Rejeté avec raison listée au marchand. `triage.ts` ~102.
7. **Compteurs exacts, rien ne s'évapore.** `accepted.length + rejected_lines === total` (invariant testé).
8. **Cascade de match STRICTE** : `pos_item_id > EAN exact > SKU exact > nom exact > fuzzy`.
   `matchProduct` (`enrichment/match-product.ts`). Fuzzy désactivable (`allowFuzzy:false`, forcé en POS).
9. **Index complet et paginé** (`buildProductIndex`, SELECT admin sans limit) — sinon un produit
   au-delà de la page 1 serait recréé en doublon. SKU matché **case-insensitive**.
10. **Détection de type d'identifiant** (`detectIdentifierType`) : ean13 / ean8 / upc12 / **isbn13**
    (préfixe 978/979) / **cip13** (préfixe 340, médicaments FR) / invalid.

## Modes d'échec attendus

| Échec | Comportement EXIGÉ | Où |
|---|---|---|
| Code EAN faux checksum | rejet → SKU (jamais lookup GTIN) | `triage.ts` |
| Ligne sans identité (nom seul) | rejet **compté + listé** (jamais silencieux) | `triage.ts` |
| Lecture index produits KO | **fail-loud** (throw), caller catch + Sentry | `buildProductIndex` |
| Aucun match | `null` → create (fail-open volontaire) | `matchProduct` |

## Preuves exigées
- **Unit (fait, pur)** : tous les invariants ci-dessus sont unit-testables sans env. Fixtures :
  GTIN réels, UPC-12, checksum faux, SKU limites, ISBN/CIP.
- **PREUVE RÉELLE** : un fichier marchand réel triagé → inspecter `rejected_samples` (les rejets
  sont-ils légitimes ?) et le taux GTIN/SKU. Peut se faire sur fichier réel sans serveur (fonction pure).

## Statut réel + dette connue
- **done + testé** : triage, matching, validation, détection type.
- **dette** :
  - `matchProduct` fuzzy (Levenshtein) reste **risqué sur le chemin fichier** (peut matcher un
    produit différent) → à durcir/désactiver hors POS. (Même dette que M1.)
  - `isPlaceholderName` rejette « EAN xxx » synthétisé, mais l'échantillon marchand l'omet (`triage.ts` ~106).

## Périmètre Fable 5
- **AUDITER** : réfuter « nom seul jamais identité » et « EAN faux jamais lookup » — chercher un
  chemin (POS, webhook, fichier, wizard) où un match par nom ou un code faux publie un produit.
  Vérifier l'invariant de conservation des compteurs sur chaque chemin. Confirmer `allowFuzzy:false`
  effectif partout sauf où c'est justifié.
- **CONSTRUIRE** : durcir le fuzzy hors POS (dette). Barre de preuve = régression + fichier réel triagé.
