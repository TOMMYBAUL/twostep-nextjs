# SP3 — Coach IA Tips : Design Spec

**Date :** 2026-03-27
**Statut :** Validé par Thomas
**Backend :** Groq free tier + Llama 3.3 70B (open source, hébergé par Groq)

---

## Vue d'ensemble

Le Coach IA affiche deux blocs dans le dashboard marchand : un **Insight** (constat intelligent) et une **Action** (conseil actionnable avec CTA). Les tips sont générés une fois par jour par Groq, stockés en base, et consultables dans un historique filtrable.

## Deux types de tips

### Insight — "Voilà ce qui se passe"

- Descriptif, analytique
- Basé sur les données du marchand (stats, évolutions, comparaisons semaine précédente)
- Exemples :
  - "Vos vues ont doublé cette semaine, surtout grâce à votre promo -20% sur les baskets."
  - "Votre taux de disponibilité est passé de 70% à 85% — vos clients voient plus de produits en stock."
  - "Vous avez gagné 12 abonnés cette semaine, +30% vs la précédente."

### Action — "Fais ça"

- Prescriptif, concret
- Texte explicatif (1-3 phrases) + bouton CTA quand pertinent
- Exemples :
  - "3 produits sans photo passent inaperçus — ajoutez une photo rapide avec votre téléphone." → CTA "Ajouter une photo"
  - "Aucune promo active. Une petite remise de 10% suffit à apparaître dans Promos du moment." → CTA "Créer une promo"
  - "Partagez votre profil Two-Step sur Instagram pour toucher vos clients existants." → Pas de CTA (action externe)

## Catégories

Chaque tip est taggé avec une catégorie. Le modèle tourne entre les catégories pour varier les conseils.

| Catégorie | Scope |
|---|---|
| **Photos** | Couverture photo produits, qualité visuelle |
| **Stock** | Disponibilité, ruptures, réapprovisionnement |
| **Promos** | Promotions actives, impact des promos |
| **Profil** | Description, photo boutique, complétude |
| **Engagement** | Vues, favoris, abonnés, partage réseaux |

## Rythme

- **1 insight + 1 action par jour** par marchand
- Génération à la première visite du jour (lazy), puis cache en base pour la journée
- Fallback statique si Groq est down (tips pré-écrits par catégorie, comme actuellement)

## Affichage dashboard

Deux blocs séparés, toujours visibles en même temps sur la page d'accueil du dashboard :

```
┌─────────────────────────────────────┐
│ 📊 Votre situation                  │
│ Vos vues ont doublé cette semaine,  │
│ surtout depuis Saint-Cyprien...     │
│                          [Photos]   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 💡 Action du jour                   │
│ 3 produits sans photo passent       │
│ inaperçus — ajoutez une photo...    │
│                  [Ajouter une photo] │
│                          [Photos]   │
└─────────────────────────────────────┘

          Voir l'historique →
```

- Badge catégorie en bas à droite de chaque bloc
- Bouton CTA uniquement sur le bloc Action, uniquement quand pertinent
- Lien "Voir l'historique" sous les deux blocs

## Historique

- Page dédiée : `/dashboard/tips-history`
- Accessible via le lien sous les tips
- Liste chronologique (plus récent en haut)
- Filtre par catégorie (Photos, Stock, Promos, Profil, Engagement)
- Pagination (20 tips par page)
- Chaque entrée affiche : date, type (insight/action), catégorie, texte

## API

### `GET /api/merchants/[id]/tips`

Retourne le couple insight + action du jour.

**Response :**
```json
{
  "insight": {
    "emoji": "📊",
    "text": "Vos vues ont doublé cette semaine...",
    "category": "engagement"
  },
  "action": {
    "emoji": "📸",
    "text": "3 produits sans photo passent inaperçus...",
    "category": "photos",
    "cta": {
      "label": "Ajouter une photo",
      "href": "/dashboard/products?filter=no-photo"
    }
  }
}
```

Le champ `cta` est `null` quand l'action n'a pas de destination dans l'app.

### `GET /api/merchants/[id]/tips/history?category=&page=`

**Query params :**
- `category` (optionnel) : filtrer par catégorie
- `page` (optionnel, défaut 1) : pagination

**Response :**
```json
{
  "tips": [
    {
      "id": "uuid",
      "type": "insight",
      "emoji": "📊",
      "text": "...",
      "category": "engagement",
      "created_at": "2026-03-27"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 20
}
```

## Base de données

### Table `coach_tips`

| Colonne | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `merchant_id` | uuid | FK → merchants |
| `type` | text | "insight" ou "action" |
| `emoji` | text | Emoji du tip |
| `text` | text | Contenu du conseil |
| `category` | text | photos, stock, promos, profil, engagement |
| `cta_label` | text | Libellé du bouton CTA (nullable) |
| `cta_href` | text | URL du CTA (nullable) |
| `created_at` | timestamptz | Date de création |

**Index :** `(merchant_id, created_at DESC)` pour l'historique paginé.
**Index :** `(merchant_id, type, created_at DESC)` pour récupérer le tip du jour par type.

## Prompt Groq

Un seul appel API génère les deux tips. Le prompt inclut :
- Données du marchand (stats funnel, stock, promos, score, profil)
- Instruction de retourner un JSON avec un insight + une action
- Catégorie et CTA à choisir en fonction des données
- Consigne de ton : ami bienveillant, spécifique aux données, pas générique

## Capacité free tier

- 500 marchands × 1 appel/jour = 500 appels/jour
- Groq free tier : 30 req/min = 43 200 req/jour
- Marge : ×86 — largement suffisant

## Migration depuis l'existant

- Revert `route.ts` vers Groq SDK (actuellement modifié en Ollama par erreur)
- Renommer endpoint `/tip` → `/tips` (pluriel)
- Remplacer le cache in-memory par la table `coach_tips`
- Adapter le composant `coach-tip.tsx` pour afficher deux blocs
- Ajouter page historique
