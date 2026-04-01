# Two-Step — Phase 4 : Moodboards & Direction visuelle

> Spec validée le 1er avril 2026 — Phase 4 du redesign frontend

---

## 1. Direction générale — "Clean base, Bold accents"

### Principe

Fond blanc minimal (Instagram/Airbnb) + typographie bold et accents énergiques (SNKRS/StockX). L'interface est calme, les données importantes sont mises en valeur. Le clean inspire la confiance, le bold attire l'œil sur l'essentiel.

### Quand c'est bold
- Titres de section (font-weight 800, letter-spacing négatif)
- Prix
- Badges promo (% de réduction)
- Chiffres/métriques

### Quand c'est clean
- Navigation (tabs, pills, bottom bar)
- Labels et descriptions
- Fonds et espacement
- Bordures et séparateurs

### Couleurs

| Rôle | Valeur | Usage |
|------|--------|-------|
| Accent principal | `#4268FF` | CTA consumer, liens, indicateurs actifs, badges |
| Texte principal | `#1A1A1A` | Titres, noms, prix |
| Texte secondaire | `#AAAAAA` | Descriptions, distances, labels |
| Fond principal | `#FFFFFF` | Contenu, cards |
| Fond secondaire | `#F5F5F5` / `#FAFAFA` | Inputs, cards secondaires, pills inactifs |
| Bordures | `#F0F0F0` / `#F3F4F6` | Séparateurs, bordures de cards |
| Succès | `#2E7D32` | "Ouvert", stock OK |
| Alerte | `#F59E0B` | Stock bas, "Dernier jour" |
| Erreur | `#DC2626` | Rupture, "Fermé" |
| CTA B2B | `#1A1A1A` | Boutons marchands (noir, pas bleu) |

### Typographie

| Usage | Font | Weight | Size | Letter-spacing |
|-------|------|--------|------|----------------|
| Titres de section | Archivo Black (font-heading) | 800-900 | 17-22px | -0.3px à -0.5px |
| Noms de produit | Barlow (font-body) | 700 | 12-13px | -0.2px |
| Prix | Barlow | 800 | 13-20px | 0 |
| Labels/descriptions | Inter | 400-500 | 10-12px | 0 |
| Pills catégorie | Inter | 600 | 11px | 0 |
| Métriques (chiffres) | Barlow | 800 | 20-28px | -0.5px |

### Coins arrondis

| Élément | Radius |
|---------|--------|
| Cards produit | 10px |
| Buttons | 10-12px |
| Pills catégorie | 20px (full round) |
| Bottom sheets / drawers | 16px (top corners) |
| Avatars boutique | 10px (carré arrondi) ou 50% (rond) |
| Inputs | 8px |
| Badges | 6-8px |

---

## 2. App consumer

### 2.1 Feed principal (onglet Accueil)

- **Header TikTok** : 3 onglets centrés (Explorer / Pour toi / Suivis) avec indicateur animé (motion.div layoutId, spring stiffness: 200, damping: 30)
- **Pills catégories** : 6-8 catégories dynamiques + bouton "Tout ▾" qui ouvre le drawer
- **Sections du feed Explorer** : titre bold 17px + "Voir tout →" en bleu
- **Scroll infini** avec message "Tu as tout vu 📍" en fin de feed

### 2.2 Cards produit — Modèle B équilibrée

```
┌─────────────────────┐
│                     │
│   [image 2:3]    ♡  │
│                     │
├─────────────────────┤
│ Nom du produit      │  13px, weight 700
│ Boutique · 300m     │  11px, #AAA
│ 89,00 €             │  13px, weight 800
└─────────────────────┘
```

- Image ratio flexible (pas forcément 2:3, s'adapte au produit)
- Cœur favori en haut à droite, fond blanc rond avec ombre subtile
- Grille 2 colonnes, gap 8px
- Hover : image scale 1.03, transition 300ms

### 2.3 Cards promo (onglet Promos) — Modèle A liste compacte

```
┌────────────────────────────────────┐
│ [img 76×76]  Nom du produit        │
│     -30%     Boutique · 300m       │
│              53,40 €  ̶8̶9̶,̶0̶0̶ ̶€̶    │
└────────────────────────────────────┘
```

- Badge % en bleu `#4268FF` en haut à droite de l'image
- Urgence : bordure gauche orange `#F59E0B` + texte "⏱ Dernier jour · Plus que 1"
- Trié par % réduction × proximité

### 2.4 Fiche boutique — Cover immersive

- **Cover photo** : plein écran, gradient overlay `linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%)`
- Logo rond (48px) + nom bold (17px) sur la cover en bas
- Bouton retour : cercle blanc/90% opacité, ombre subtile
- **Zone info** : stats (abonnés · produits), badge ouvert/fermé, horaires
- **Boutons** : [S'abonner flex-1] [Instagram?] [TikTok?] [Site web?] [Partager]
- **Tabs** : Catalogue / Promos / Suggestions (pas "Avis" — pas de notes)
- **Pas de "J'arrive"** sur la fiche boutique — uniquement sur la fiche produit

### 2.5 Fiche produit — Carrousel + barre sticky

- **Image** : carrousel swipable avec dots en bas (support multi-photos)
- **Boutons overlay** : retour (←), partage (↗), favori (♡) en cercles blancs
- **Badge stock** : "Plus que 2" seulement quand stock ≤ 3 (pas de "En stock" — tout est en stock par définition)
- **Info** : nom bold 19px, tags (catégorie · marque · couleur) en 11px, prix bold 20px
- **Tailles** : pills sélectionnables, uniquement les tailles disponibles (jamais de tailles grisées)
- **Boutique** : card cliquable (avatar + nom + distance + ouvert/fermé)
- **Barre sticky bas** : [J'arrive 👋 flex-1] [📍 Itinéraire] — toujours visible au scroll

### 2.6 Profil — Preview du contenu

- **Carousel horizontal** des favoris (on voit les produits)
- **Avatars ronds** des boutiques suivies
- **Sections cliquables** : Mes tailles (M · 42), Notifications, Paramètres
- **Bouton désactivation animations** dans Paramètres

### 2.7 Carte / Recherche

- **Mode Carte** : carte plein écran + barre recherche flottante + pills catégories + toggle Liste/Carte. Tap sur un pin → mini-fiche boutique en bas.
- **Mode Liste** : fond blanc + barre recherche + pills + liste boutiques scrollable
- Toggle switch entre les deux modes. Pas de bottom sheet superposé.
- **Pins** : cercles avec nombre de produits. Bleu `#4268FF` = boutique avec promos. Noir = sans promo.

### 2.8 Empty states

- **Icônes** : 3D Thiings (téléchargées, dans `public/illustrations/`)
- **Structure** : icône 3D (taille ~64px) + titre bold 15px + description 12px (2 lignes max) + CTA bouton
- **Pas d'emojis natifs** dans les empty states
- **Profil boutique et Google Merchant** : icônes Untitled UI (pas de 3D pour ceux-là)

| État | Icône Thiings | CTA |
|------|---------------|-----|
| Suivis vide | boutique/store | Explorer les boutiques |
| Favoris vide | cœur | Découvrir |
| Recherche sans résultat | loupe | Élargir à 20 km |
| Pour toi vide | étoiles/sparkle | Mes tailles / Explorer |
| Promos vide | étiquette prix | Explorer les boutiques |
| Fin du scroll | pin localisation | — |

---

## 3. Dashboard marchand — Sobre Shopify/Linear

### 3.1 Principes

- Fond blanc pour le contenu, gris très clair `#FAFAFA` pour la sidebar
- Bordures fines `#F0F0F0`
- Typographie bold uniquement sur les chiffres et les noms
- Bleu `#4268FF` uniquement pour les CTA et éléments interactifs
- Zéro emoji dans les métriques

### 3.2 Page Accueil

- **Header** : "Bonjour, [prénom]" bold 18px + "Dernière sync il y a X min" en gris + bouton "Voir ma boutique ↗"
- **Métriques** : 4 cards en ligne (Vues / En stock / Promos / J'arrive). Le "J'arrive" est mis en valeur : bordure bleue, fond `#FAFBFF`, texte bleu
- **Onboarding** : barre de progression + prochaine étape. Visible tant que les 5 étapes ne sont pas terminées
- **Conseil du jour** : card avec bordure gauche bleue, texte + CTA

### 3.3 Page Produits (+ Stock)

- **Métriques** : 4 cards (Total / En stock vert / Stock bas orange / Rupture rouge)
- **Tabs** : Catalogue / Incomplets
- **Barre de recherche**
- **Tableau** : miniature 40×40, nom + marque + taille, prix, contrôles stock (−/nombre/+), badge état (OK vert, Bas orange, Rupture rouge)
- Produits en rupture en opacité réduite (0.5)

### 3.4 Page Ma boutique

5 sections empilées en cartes blanches :
1. **Photo de couverture** — preview + bouton "Changer" + dimensions recommandées (1200×600)
2. **Logo** — avatar rond 64px + upload
3. **Informations** — nom, description (textarea), téléphone
4. **Adresse** — rue, ville
5. **Horaires** — 7 jours, "Fermé" en rouge
- Bouton "Voir ma page ↗" en haut
- Un seul "Enregistrer" en bas

### 3.5 Page Réglages

3 sections empilées :
1. **Connexion caisse** — état (Connecté/Déconnecté), provider, dernière sync, bouton Sync
2. **Réseaux sociaux & Site web** — Instagram, TikTok, Site web (3 inputs + Enregistrer)
3. **Compte** — email (readonly), mot de passe (modifier)

### 3.6 Version mobile

- **Sidebar** → bottom tab bar 5 onglets (Accueil / Produits / Promos / Boutique / Plus)
- **Métriques** : grille 2×2 (accueil) ou pills horizontaux (produits)
- **Tableau produits** → cards horizontales (image + nom/marque/prix + contrôles ±)
- Mêmes animations que desktop

---

## 4. Homepage — Storytelling + Motion design

### 4.1 Structure des sections

| # | Section | Fond | Contenu |
|---|---------|------|---------|
| 1 | Hero | Dark `#1A1F36` | Titre bold 28px, sous-titre, CTA "Découvrir →", "Gratuit · Sans compte" |
| 2 | Ticker | Dark `#1A1F36` | Noms des boutiques partenaires défilants |
| 3 | Comment ça marche | Light `#FFFFFF` | 3 étapes avec mockup téléphone sticky (desktop) ou screenshots empilés (mobile) |
| 4 | Stats | Dark `#1A1F36` | Compteurs animés (boutiques, produits, ville) |
| 5 | Pour les marchands | Light `#FFFFFF` | CTA B2B noir, 3 bullet points, "Inscrire ma boutique →" |
| 6 | CTA final | Bleu `#4268FF` | Titre + CTA inversé (bouton blanc) |
| 7 | Footer | Dark `#0F1218` | Liens légaux, contact, © |

### 4.2 Motion design — Détail par section

#### Hero
- **Parallax fond** : background gradient bouge à 0.3× la vitesse du scroll (`useScroll` + `useTransform`)
- **Apparition titre** : slide-up spring (y: 80→0, stiffness: 200, damping: 30) avec delay 0.2s
- **Cascade** : sous-titre +0.1s, CTA +0.2s
- **Navbar** : transparente au début → glassmorphism (`backdrop-filter: blur(20px)`) au scroll. Transition 300ms.

#### Ticker
- **Défilement infini CSS** : `@keyframes` translate3d, durée ~22s, linear, contenu dupliqué
- **GPU optimisé** : `will-change: transform`, `backface-visibility: hidden`, `perspective: 1000px`

#### Comment ça marche
- **Desktop** : mockup téléphone `position: sticky; top: 80px` à gauche. Les 3 étapes scrollent à droite. Crossfade entre screenshots (opacity 300ms) quand une étape entre dans le viewport.
- **Mobile** : chaque étape a son screenshot AU-DESSUS du texte. Slide-up spring quand le screenshot entre dans le viewport.
- **Étape active** : opacity 1 + bordure gauche bleue. Autres : opacity 0.4. Transition 200ms.
- **Détection** : Framer Motion `useInView`

#### Stats
- **Compteurs animés** : 0 → valeur réelle en ~1.5s quand la section entre dans le viewport
- **Easing** : `cubic-bezier(0.35, 0.35, 0, 1)` (linéaire qui ralentit)
- **Stagger** : chaque compteur +150ms de décalage

#### Pour les marchands
- **Slide-up standard** : spring stiffness: 200, damping: 30, y: 50→0
- **Cascade** : titre, texte (+100ms), CTA (+200ms)

#### CTA final
- **Scale-up** : section apparaît avec scale: 0.95→1, opacity: 0→1. Spring stiffness: 150, damping: 30.
- **Bouton pulse** : scale 1→1.02→1 en boucle toutes les 3s. Subtil.

### 4.3 Setup technique

| Librairie | Rôle | Statut |
|-----------|------|--------|
| `motion` v12 | Animations, springs, useInView, useScroll | ✅ Installé |
| `lenis` | Smooth scroll global | ✅ Installé |
| `react-swipeable` | Swipe gestures | ✅ Installé |
| `vaul` | Bottom sheets / drawers | ✅ Installé |

### 4.4 Animations desktop = mobile

- **Mêmes animations sur toutes les tailles d'écran**
- Seul le layout change (colonnes → empilé), pas les effets
- **Bouton "Désactiver les animations"** dans Profil > Paramètres du consumer
- **`prefers-reduced-motion`** respecté en CSS : toutes les animations désactivées automatiquement

### 4.5 Spring par défaut

```typescript
const DEFAULT_SPRING = { type: "spring", stiffness: 200, damping: 30 };
const SOFT_SPRING = { type: "spring", stiffness: 150, damping: 30 };
```

Défini une seule fois dans un fichier `src/lib/motion.ts`, importé partout.

### 4.6 Navbar homepage

- **Position fixed**, transparente par défaut
- Au scroll > 100px : fond `rgba(26, 31, 54, 0.85)` + `backdrop-filter: blur(20px)`
- Transition 300ms
- **Desktop** : Logo + liens (Comment ça marche, Marchands) + CTA "Découvrir"
- **Mobile** : Logo + CTA "Découvrir" uniquement

### 4.7 Version mobile homepage

- Hero plein écran (100svh)
- "Comment ça marche" : screenshots empilés verticalement (pas de sticky)
- Stats : grille 2+1 au lieu de 3 colonnes
- Footer : liens centrés, compact
- Mêmes animations (parallax, spring, compteurs, scale-up)

---

## 5. Illustrations — Thiings 3D

- **Source** : thiings.co/things (licence Personal Project, passage Commercial $49 quand revenus)
- **Stockage** : `public/illustrations/` (fichiers PNG)
- **Usage** : empty states uniquement (pas dans les métriques, pas dans la navigation)
- **Fallback** : icônes Untitled UI pour profil boutique et Google Merchant (pas de 3D Thiings disponible)

### Icônes téléchargées

| Contexte | Fichier |
|----------|---------|
| Suivis vide | store / boutique |
| Favoris vide | cœur |
| Recherche sans résultat | loupe |
| Pour toi vide | étoiles |
| Promos vide | étiquette prix |
| Fin du scroll | pin localisation |
| Connecter POS | lecteur de carte |
| Ajouter photo | appareil photo |
| Téléphone | smartphone |

---

## 6. Ce qui ne change PAS

- Charte graphique v2 Phase 1 (CSS variables, fonts chargées)
- Navigation Phase 2 (4 onglets bottom nav, header TikTok, swipe)
- Catégories Phase 3 (DB dynamique, CategoryPills, CategoryDrawer, FilterPanel)
- Pipeline IA catégorisation Phase 3
- API backend (aucun changement d'API)
- Système de follows, favoris, "J'arrive"

---

## 7. Principes validés

1. **Clean base, Bold accents** — fond blanc, typo bold sur l'essentiel
2. **Pas de "En stock"** — tout ce qui apparaît est en stock par définition
3. **"J'arrive" uniquement sur la fiche produit** — pas sur la fiche boutique
4. **Suggestions, pas avis** — feedback filtré par l'IA, pas de notes
5. **Icônes 3D Thiings pour les empty states** — pas d'emojis natifs
6. **Mêmes animations desktop et mobile** — bouton pour désactiver dans le profil
7. **Dashboard sobre** — Shopify/Linear, zéro emoji, bordures fines
8. **Homepage storytelling** — alternance dark/light, motion design scroll-driven
9. **Photo IA supprimée** — pas d'amélioration auto des photos produit
10. **Google Merchant = page dédiée** — pas dans les réglages
