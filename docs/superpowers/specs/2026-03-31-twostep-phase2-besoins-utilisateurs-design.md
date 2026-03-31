# Two-Step — Phase 2 : Besoins utilisateurs & Navigation

> Spec validée le 31 mars 2026 — Phase 2 du redesign frontend

---

## 1. Navigation principale — Bottom tabs (4 onglets)

| # | Onglet | Icône | Contenu |
|---|--------|-------|---------|
| 1 | **Accueil** | 🏠 | Feed avec 3 sous-pages swipables (Explorer / Pour toi / Suivis) |
| 2 | **Recherche** | 🔍 | Carte plein écran + barre recherche + toggle Liste/Carte |
| 3 | **Promos** | 🔥 | Feed dédié promos (prix barrés, trié proximité + date fin) |
| 4 | **Profil** | 👤 | Favoris, tailles, boutiques suivies, paramètres |

---

## 2. Onglet Accueil — Header TikTok + 3 sous-pages swipables

### Header style TikTok
- **3 onglets centrés** : Explorer / Pour toi / Suivis
- **Indicateur actif** : trait sous l'onglet actif (style TikTok, pas un pill)
- **Pas de logo** "TWO-STEP" en haut — supprimé
- **Pas de "Autour de moi"** — supprimé
- **Filtres catégorie** en dessous des tabs, partagés entre les 3 pages

### Comportement swipe
- **Swipe horizontal** pour passer entre les 3 pages, n'importe où sur l'écran
- **Tap sur l'onglet** fonctionne aussi
- **Scroll vertical infini** sur chaque page — message "Tu as tout vu 📍" quand il n'y a plus de produits
- **Position de scroll conservée** — chaque page garde son scroll quand on swipe vers une autre et qu'on revient

### Sous-page Explorer (gauche)
- Promos du moment (carrousel horizontal)
- Tendances (grille)
- Boutique à découvrir
- Tout près de toi
- Structure identique au Discover actuel (Option D), sans le header moche

### Sous-page Pour toi (centre, défaut)
- Feed algorithmique : proximité × pertinence × fraîcheur
- Filtré par taille si renseignée dans le profil
- Promos intercalées avec badge 🔥

### Sous-page Suivis (droite)
- Produits des boutiques suivies uniquement
- Reverse-chrono
- Promos en premier

---

## 3. Onglet Recherche — Architecture identique à l'Explorer actuel

**Aucun changement de design**, juste renommé et déplacé en position 2 dans la bottom nav.

Ce qu'on garde exactement :
- **Carte Mapbox plein écran** (fond de page)
- **Barre recherche flottante** en haut + bouton rayon (5 km) + bouton filtres
- **Toggle Liste / Carte** centré sous la barre de recherche (pas en bas)
- **Pins boutiques** cliquables → mini-fiche en bas
- **Autocomplete** quand on tape dans la recherche
- **Filtres catégorie** en dropdown + filtre taille
- **Mode Liste** = fond blanc + cards boutiques scrollables

---

## 4. Page "Voir tout" — Nettoyage

### Ce qui change :
- **Supprimer le logo** en haut de page
- **Supprimer le titre "Promotions"** en doré (lignes 92-98 de search/page.tsx)
- **Garder uniquement** : barre de recherche + filtres catégorie
- **Filtres identiques** à ceux de l'Accueil (même source de données)

### Catégories partagées
- Créer un fichier `lib/categories.ts` exportant la liste unique des catégories
- Importer ce fichier dans discover, explore, search, city/category, toulouse/category
- **Supprimer les 5 copies hardcodées** de `CATEGORIES` dans les pages consumer
- Les catégories actuelles dans search (Déco, Épicerie) qui n'existent pas dans discover doivent être alignées

---

## 5. Fiche boutique consumer — Liens sociaux

### Design
- Les icônes sociales sont sur la **même ligne** que le bouton S'abonner et Partager
- Ordre : [S'abonner (flex-1)] [Instagram] [TikTok] [Site web] [Partager]
- **Icônes reconnaissables** (SVG Instagram, TikTok, globe) au lieu de texte bleu
- Chaque icône **ouvre le lien** dans un nouvel onglet (target _blank)
- **Seuls les liens renseignés** apparaissent — pas d'icône si le champ est vide

### Champs dashboard (paramètres boutique)
- `website_url` — Site web
- `instagram_url` — Instagram (stocké comme @handle ou URL complète)
- `tiktok_url` — TikTok (stocké comme @handle ou URL complète)
- Tip : "Les clients verront ces liens sur votre page boutique. Ajoutez au moins votre Instagram."

---

## 6. Stories — SUPPRIMÉES

### Ce qui est supprimé :
- Page `/dashboard/stories` (dashboard marchand)
- Composant `StoryBar` (bulles en haut du feed consumer)
- Composant `StoryViewer` (viewer plein écran)
- Table `merchant_stories` (base de données)
- Bucket storage `stories` (Supabase)
- Import de StoryBar dans `shop-profile.tsx`

### Remplacement :
- Les liens sociaux (Instagram, TikTok, site web) remplacent les stories
- Le marchand publie son contenu sur ses propres réseaux, pas sur Two-Step
- Zéro friction pour le marchand

---

## 7. Dashboard marchand — Changements

### 7.1 Fusionner Produits + Stock
- **Une seule page "Produits"** (`/dashboard/products`)
- Contrôles stock (+/- et saisie directe) intégrés sur chaque ligne produit
- Métriques en haut (total, en stock, stock bas, rupture) — une seule fois
- Tab "Catalogue" / "Incomplets" conservé
- **Supprimer** `/dashboard/stock` de la sidebar et du routeur

### 7.2 Onboarding revu (5 étapes + 1 bonus)

| # | Étape | Raison de l'ordre |
|---|-------|-------------------|
| 1 | Compléter votre profil (nom, adresse, horaires) | Résultat visuel immédiat |
| 2 | Ajouter une photo de boutique | Rend la boutique vivante |
| 3 | Ajouter votre téléphone de contact | Contact client |
| 4 | Connecter votre caisse (POS) — ou créer un compte Square | Partie technique |
| 5 | Vérifier vos produits (photos, noms, stock) | Validation finale |
| **Bonus** | Connecter Google Merchant Center | Apparaît après les 5 étapes terminées |

### 7.3 Liens sociaux dans les paramètres
- Section "Réseaux sociaux & Site web" dans `/dashboard/settings`
- Champs : Site web, Instagram, TikTok
- Icône + input pour chaque
- Placeholder gris si pas renseigné

### 7.4 Page Stories supprimée
- Retirer `/dashboard/stories` de la sidebar
- Retirer le lien dans la navigation

---

## 8. Principes UX validés

1. **Curiosité drive la rétention** — le feed scrollable (promos + tendances) fait revenir les utilisateurs quotidiennement
2. **Recherche précise = valeur irremplaçable** — c'est ce qui fait garder l'app (trouver le produit exact)
3. **1 onglet = 1 job** — Accueil (browse), Recherche (trouver), Promos (deals), Profil (moi)
4. **Pattern TikTok pour le feed** — swipe horizontal entre les sous-pages, familier pour tous
5. **Le marchand publie sur ses réseaux** — pas de stories à gérer en plus, Two-Step affiche les liens
6. **Produits + Stock = une seule page** — le marchand ne doit pas chercher où gérer ses produits

---

## 9. Références design

- **TikTok** : header 3 onglets centrés, swipe horizontal, trait actif
- **Instagram** : follow/unfollow, icônes sociales sur le profil
- **Deliveroo/TGTG** : onglet Promos dédié, carte plein écran, bottom nav 4 onglets
- **Shopify Polaris** : onboarding checklist progressive, page produits unifiée

---

## 10. Ce qui ne change PAS

- Charte graphique v2 (Phase 1) — déjà implémentée
- Onglet Promos — design actuel conservé
- Onglet Profil — design actuel conservé
- Fiche produit — design actuel conservé (sauf stories supprimées)
- API backend — aucun changement d'API nécessaire pour la navigation
- Système de follows — conservé tel quel
- Système de favoris — conservé tel quel
- Bouton "J'arrive" — conservé tel quel
