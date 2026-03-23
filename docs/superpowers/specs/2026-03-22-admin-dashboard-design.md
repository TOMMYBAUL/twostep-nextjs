# Admin Dashboard — Design Spec

**Date**: 2026-03-22
**Status**: Approved

## Objectif

Dashboard interne (Thomas uniquement) pour suivre les marchands et clients de la plateforme Two-Step. Lecture + actions basiques (activer/suspendre/supprimer marchands).

## Auth admin

- Utilise `app_metadata.role = "admin"` dans Supabase Auth
- Configuration manuelle une seule fois via le dashboard Supabase
- Vérification côté serveur uniquement (non modifiable côté client)

## Routes pages

| Route | Description |
|---|---|
| `/admin` | Vue d'ensemble — métriques clés |
| `/admin/merchants` | Liste paginée des marchands + statut + actions |
| `/admin/consumers` | Liste paginée des consumers |

## Routes API

| Method | Route | Description |
|---|---|---|
| GET | `/api/admin/stats` | Compteurs globaux |
| GET | `/api/admin/merchants` | Liste marchands paginée |
| PATCH | `/api/admin/merchants/:id` | Changer statut marchand |
| GET | `/api/admin/consumers` | Liste consumers paginée |

## Protection

- Middleware : vérifier `app_metadata.role === "admin"` sur `/admin/*` et `/api/admin/*`
- Routes API : `createAdminClient()` (service role) après vérification rôle
- Non-admin → 403

## UI

- Layout admin séparé avec sidebar propre
- Réutilise composants existants : Table, Badge, MetricCard, PageHeader
- Sidebar : 3 items (Overview, Marchands, Consumers)

## Métriques (page overview)

- Total marchands (par statut)
- Total consumers
- Total produits en catalogue
- Total promotions actives
