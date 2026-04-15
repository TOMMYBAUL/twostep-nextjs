# Blog SEO — Design Spec

**Date**: 2026-04-15
**Status**: Approved
**Scope**: Infrastructure blog + 4 premiers articles SEO

## Contexte

Two-Step vient d'être indexé par Google Search Console (93→260 pages via sitemap). Le blog est le levier SEO organique #1 pour attirer marchands (payants) et consommateurs (réseau).

Stratégie : 4 articles bien écrits, infra minimale en React pur (pas de MDX/CMS), extensible plus tard.

## Architecture routes

```
src/app/(marketing)/blog/
├── page.tsx                              # Index blog (grille de cartes)
├── layout.tsx                            # Layout + metadata blog
├── components/
│   ├── article-layout.tsx                # Template réutilisable
│   └── article-card.tsx                  # Carte pour l'index
├── boutique-visible-google/
│   └── page.tsx                          # Article 1 — marchands
├── logiciel-de-caisse-commerce/
│   └── page.tsx                          # Article 2 — marchands
├── boutiques-mode-toulouse/
│   └── page.tsx                          # Article 3 — consommateurs
└── shopping-sneakers-toulouse/
    └── page.tsx                          # Article 4 — consommateurs
```

## Template ArticleLayout

### Props

```ts
interface ArticleProps {
    title: string;
    description: string;
    slug: string;
    publishedAt: string;          // "2026-04-15"
    updatedAt?: string;
    readingTime: string;          // "8 min de lecture"
    category: "marchands" | "consommateurs";
    children: React.ReactNode;
}
```

### Rendu automatique

- Hero : titre (H1), badge catégorie, date, temps de lecture
- TOC : généré à partir des H2 du contenu (scroll spy ou ancres)
- Sidebar sticky : CTA contextuel
  - marchands → "Inscrire ma boutique" (/onboarding)
  - consommateurs → "Découvrir les boutiques" (/discover)
- JSON-LD BlogPosting : headline, author, datePublished, dateModified, publisher, image
- JSON-LD BreadcrumbList : Accueil > Blog > [Article]
- Section "Articles similaires" en bas (2 articles même catégorie)
- CTA final pleine largeur

### Style

- Charte Two-Step : Archivo Black (titres), Barlow (body), bleu #4268FF
- Largeur lecture : max-w-[680px] texte, max-w-[1100px] layout avec sidebar
- Responsive : sidebar disparaît sur mobile, CTA sticky bottom mobile

## Page index blog

- Grille de cartes (2 colonnes desktop, 1 mobile)
- Chaque carte : gradient branded comme image placeholder, titre, extrait, badge catégorie, date
- Pas de pagination (4 articles)
- Metadata : title "Blog | Two-Step", description unique

## Articles

### Article 1 — "Comment rendre votre boutique visible sur Google sans site e-commerce"

- **Slug** : boutique-visible-google
- **Cible** : commerçants indépendants sans site
- **Sections** : Le problème de visibilité / Ce que Google Business Profile ne fait pas / L'enrichissement IA / Google Shopping sans Shopify / Démarrer en 10 min
- **CTA** : Inscrire ma boutique
- **Mots** : ~1500
- **Liens internes** : /marchands, /tarifs, /produit

### Article 2 — "Quel logiciel de caisse choisir pour un commerce indépendant en 2026"

- **Slug** : logiciel-de-caisse-commerce
- **Cible** : commerçants qui comparent les POS
- **Sections** : Critères de choix / Tableau comparatif / Avis par profil / La question du stock en ligne
- **CTA** : Quel que soit votre caisse, Two-Step la connecte
- **Mots** : ~2000
- **Liens internes** : /produit, /marchands, /tarifs

### Article 3 — "Les meilleures boutiques de mode à Toulouse"

- **Slug** : boutiques-mode-toulouse
- **Cible** : consommateurs toulousains
- **Sections** : Par quartier (Capitole, Saint-Cyprien, Carmes, Saint-Étienne)
- **CTA** : Voir le stock en temps réel
- **Mots** : ~1200
- **Liens internes** : /discover, /toulouse/mode, /toulouse/chaussures

### Article 4 — "Shopping sneakers à Toulouse : où trouver les modèles que tu cherches"

- **Slug** : shopping-sneakers-toulouse
- **Cible** : consommateurs sneakers
- **Sections** : Shops spécialisés / Multimarques avec stock / Vérifier la dispo avant de se déplacer
- **CTA** : Cherche tes sneakers sur Two-Step
- **Mots** : ~1000
- **Liens internes** : /discover, /toulouse/chaussures, /toulouse/sport

## SEO technique

Chaque article embarque :
- Metadata unique : title (< 60 chars), description (< 155 chars), canonical, OG tags
- JSON-LD BlogPosting + BreadcrumbList
- Internal linking vers pages pertinentes du site + autres articles

Intégrations globales :
- Sitemap : ajouter /blog + 4 slugs dans sitemap.ts
- Nav : ajouter lien "Blog" dans la nav principale
- Footer : ajouter lien "Blog"

## Ce qui n'est PAS inclus

- Pas de CMS headless
- Pas de MDX
- Pas de système de commentaires
- Pas de newsletter/email capture
- Pas de pagination
- Pas de catégories/tags comme pages séparées
- Pas d'images custom (gradients branded comme placeholders)
