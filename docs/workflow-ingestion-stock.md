# Workflow d'ingestion stock — modèle NearSt (POS-agnostique)

> Implémenté le 2026-06-12. Reproduit le mécanisme central de NearSt : un push de
> fichier récurrent, sans intégration API propriétaire, qui fonctionne avec
> **n'importe quelle caisse** capable d'exporter un CSV/XLSX — y compris les
> caisses françaises à compte développeur fermé.

## Le principe

On ne dépend PAS de l'API de chaque caisse. Le marchand (ou sa caisse, via un
export planifié) **pousse un fichier** `{code-barres ; quantité ; prix}` sur un
endpoint, authentifié par un **jeton unique par boutique**. Chaque push remplace
l'état du stock (sémantique snapshot, idempotente). L'enrichissement (catégorie,
photo, taille, nom canonique) est fait côté Two-Step à partir du code-barres, via
la cascade 6 tiers existante et le cache mutualisé `ean_lookups`.

## Le contrat de données (minimal, à la NearSt)

Fichier **CSV ou XLSX**, une ligne par produit. En-têtes reconnus (FR + EN,
accents et `;`/`,` gérés) :

| Rôle | En-têtes acceptés | Requis |
|---|---|---|
| Code-barres | `code-barres`, `ean`, `gtin`, `barcode`, `upc`, `gencode`… | au moins un identifiant* |
| Quantité | `quantité`, `qté`, `quantity`, `stock`, `qty`… | recommandé (sinon = 1 / "présence") |
| Prix | `prix`, `price`, `tarif`, `pu`… | recommandé |
| SKU (interne) | `référence`, `ref`, `sku`, `code article`… | * alternative au code-barres |
| Nom | `désignation`, `nom`, `title`, `produit`… | optionnel (vient de l'enrichissement) |
| Marque | `marque`, `brand`, `fabricant`… | optionnel |

\* **Une identité est requise** : code-barres OU SKU OU nom. Un code-barres qui
passe le **checksum GTIN** (EAN-8/12/13/14) est traité comme une identité
globale (→ enrichissement auto). Un code qui échoue au checksum (ex.
`TSHIRT-NOIR-42`) est traité comme **SKU interne** — c'est la distinction
GTIN-vs-SKU de NearSt, appliquée automatiquement.

## Les endpoints

### `POST /api/ingest/stock` — le push (machine, sans session)
- Auth : `Authorization: Bearer <token>` (ou `?token=`).
- Corps : `multipart/form-data` (champ `file`) **ou** corps brut (HTTP PUT direct).
- Réponse : `{ ok, status, products_created, products_updated, stock_replaced, total_items, errors }`.
- Rate-limit : 12 req/min par jeton.

```bash
curl -X POST "https://twostep.fr/api/ingest/stock" \
  -H "Authorization: Bearer <token>" -F "file=@stock.csv"
```

Le marchand programme cette commande (cron, tâche planifiée, export auto de sa
caisse) toutes les ~15 min.

### `GET /api/ingest/token` — récupération du jeton (marchand, session)
Renvoie le jeton, l'URL de push, un exemple de commande, et la fraîcheur du
dernier push (`last_used_at`, `last_rows`, `last_status`). `POST` régénère le jeton.

## Pièces livrées
- `supabase/migrations/093_ingest_credentials.sql` — table jetons (RLS owner-only, **hors** `merchants` dont le SELECT est public).
- `src/lib/ean/validate.ts` — checksum GTIN (distinction EAN vs SKU).
- `src/lib/ingest/parse-stock.ts` — parseur snapshot (nom optionnel, UTF-8/`;` robustes).
- `src/lib/ingest/snapshot.ts` — moteur match→replace→create→enrichissement (réutilise la cascade existante).
- `src/lib/ingest/token.ts` — génération/résolution de jeton.
- `src/app/api/ingest/stock/route.ts` + `src/app/api/ingest/token/route.ts`.
- `tests/ingest-parse-stock.test.ts` — contrat NearSt vérifié.

## Limites assumées / à compléter
- Canaux : seul **HTTP** est livré. FTP et **email** (réutiliser l'infra
  `inbound-email` existante pour les caisses qui ne savent qu'envoyer un mail) sont
  les extensions naturelles pour couvrir 100% des caisses.
- Second fichier "custom product data" (marque/titre/photo pour les produits
  **sans** GTIN, créateurs) : non livré — passe par le scan / saisie pour l'instant.
- Pas d'UI dashboard pour afficher l'URL de push (l'endpoint `GET` existe, la page non).
- **Migration 093 non appliquée** : à appliquer avant tout test e2e réel.
