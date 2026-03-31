# Refonte visuelle — Charte Minuit Électrique

> Date : 2026-03-29
> Branche : `feat/charte-minuit-electrique`
> Backup : `backup/pre-minuit-electrique`

## Résumé

Refonte visuelle complète de Two-Step : nouvelles polices, nouvelle palette de couleurs, passage d'un thème chaud/crème à un thème clair élégant avec accents bleu électrique.

## Décisions validées

| Question | Décision |
|----------|----------|
| Scope | Tout : consumer + marketing + dashboard + auth |
| Polices | Cormorant Garamond (titres, marque) + Syne (UI, body) |
| Palette accent | Bleu électrique `#4268FF`, clair `#93AEFF` |
| Site marketing | Fond blanc, sections gris doux `#F8F9FC`, CTA sombre `#070A10` |
| App consumer | Fond clair élégant, blanc + gris bleuté |
| Dashboard | Fond clair `#F8F9FC`, sidebar dark `#0E1420`, accents bleu |
| Auth | Thème clair, cohérent avec le reste |

## Palette de couleurs

### Fonds
| Couleur | Hex | Usage |
|---------|-----|-------|
| Blanc | `#FFFFFF` | Fond principal, cards |
| Gris doux | `#F8F9FC` | Fond secondaire, sections alternées |
| Gris input | `#F5F6FA` | Champs, placeholders, images vides |
| Gris bordure | `#E2E5F0` | Bordures, séparateurs |
| Gris bordure léger | `#ECEEF4` | Séparateurs subtils |
| Dark (CTA/sidebar) | `#070A10` | Section CTA marketing, sidebar dashboard |
| Surface dark | `#0E1420` | Sidebar dashboard |

### Texte
| Couleur | Hex | Usage |
|---------|-----|-------|
| Primaire | `#1A1F36` | Titres, noms produits |
| Secondaire | `#8E96B0` | Descriptions, métadonnées |
| Discret | `#A8AEBF` | Prix, labels discrets |

### Accent
| Couleur | Hex | Usage |
|---------|-----|-------|
| Électrique | `#4268FF` | CTA, badges "En stock", liens actifs, tab active |
| Brume | `#93AEFF` | Texte sur fond accent dark |

## Typographie

### Polices
| Famille | Usage | Poids |
|---------|-------|-------|
| Cormorant Garamond | Marque "TWO—STEP", titres pages, noms produits | 300, 400, italic 300 |
| Syne | Navigation, boutons, labels, corps, prix | 400, 500, 700 |

### Règles
- Le nom "TWO—STEP" est toujours en Cormorant Garamond, poids 300, letter-spacing 0.1em
- Les prix sont discrets : `font-weight: 400`, couleur `#A8AEBF`
- Les labels de section : Syne 11px, 500, letter-spacing 0.12em, uppercase

## Anciennes couleurs à remplacer

| Ancienne | Hex | Remplacer par |
|----------|-----|---------------|
| Crème fond | `#F5EDD6` | `#FFFFFF` ou `#F8F9FC` |
| Crème dark | `#EDE0C4` | `#F5F6FA` |
| Ochre | `#C8813A` | `#4268FF` |
| Ochre dark | `#A86828` | `#3558E0` |
| Brown | `#2C2018` | `#1A1F36` |
| Brown mid | `#6B4F38` | `#8E96B0` |
| Terracotta | `#E07A5F` | `#4268FF` |
| Sage | `#81B29A` | garder pour success/vert |
| Terracotta hover | `#c96a50` | `#3558E0` |

## Approche : page par page

1. Fichiers CSS centraux (polices + couleurs de base)
2. Site marketing (hero, nav, sections, footer)
3. App consumer (discover, explore, search, shop, product, favorites, profile)
4. Auth (login, signup, forgot-password, reset-password)
5. Dashboard (layout, sidebar, toutes les pages)
6. Onboarding
7. Pages utilitaires (mentions légales, 404, loading, error)

Chaque étape est commitée séparément pour pouvoir rollback.
