# Too Good To Go -- UI/UX Research (Mars 2026)

Recherche approfondie de l'interface TGTG pour servir de reference architecturale au projet Two-Step (decouverte de produits locaux).

---

## 1. Architecture de Navigation

### Bottom Tab Bar (5 onglets)

| Position | Label | Icone | Role |
|----------|-------|-------|------|
| 1 | **Discover** | Boussole / Etoile | Page d'accueil, feed personnalise |
| 2 | **Browse** | Loupe / Liste | Recherche, filtres, vue liste + carte |
| 3 | **Scan** | QR code (central) | Scanner pour retrait en magasin (ajout recent) |
| 4 | **Favorites** | Coeur | Lieux sauvegardes, alertes dispo |
| 5 | **Me** / **Profile** | Silhouette | Commandes, impact, parametres |

**Comportement visuel :**
- Onglet actif : icone remplie (filled) + label a 100% d'opacite
- Onglet inactif : icone outline + label attenue
- Pas d'animation de transition entre onglets (critique : "fonctionnel mais sobre, pas engageant")
- Barre fixe en bas, toujours visible sauf en plein ecran carte

---

## 2. Discover / Home Screen

### Structure verticale (scroll)

```
[Location selector]      ← ville/quartier en haut
[Search bar]             ← placeholder "Rechercher un magasin"
[Category chips]         ← horizontal scroll : Tout, Repas, Boulangerie, Epicerie, etc.
─────────────────────────
[Section: "Disponible maintenant"]
  → Scroll horizontal de cartes surprise bag
[Section: "A recuperer demain"]
  → Scroll horizontal de cartes
[Section: "Nouveau pres de chez vous"]
  → Scroll horizontal de cartes
[Section: "Vos favoris"]
  → Scroll horizontal de cartes
[Section: "Juste rate"]
  → Scroll horizontal (bags vendus recemment)
[Section: "Epiceries"]
  → Scroll horizontal filtre par categorie
[Section: "Boulangeries"]
  → Scroll horizontal filtre par categorie
─────────────────────────
```

### Observations cles
- **Layout Netflix-style** : sections verticales, contenu horizontal par section
- Chaque section a un titre + "Voir tout >" a droite
- Les categories en haut (chips) filtrent le feed entier
- **Critique UX identifiee** : trop de sections creent un scroll vertical excessif
- Les cartes varient de taille selon la section (grandes dans "Dispo maintenant", plus petites dans les categories)
- Le selecteur de localisation est trop discret (texte petit en haut), devrait etre plus visible

### Personnalisation du feed
- Recommendations basees sur : historique d'achat, localisation, heure du jour
- Filtres par segment : dejeuner, petit-dejeuner, diner, courses
- Highlight des nouveaux Surprise Bags recemment ajoutes

---

## 3. Carte (Surprise Bag Card)

### Anatomie d'une carte produit

```
┌──────────────────────────────────┐
│  [IMAGE HERO - photo du magasin] │  ← 60% de la hauteur
│  ┌──────┐                        │
│  │ TAG  │ "Demain" ou "Dispo"    │  ← badge en overlay sur l'image
│  └──────┘                        │
├──────────────────────────────────┤
│  NOM DU MAGASIN                  │  ← bold, 16px
│  ★ 4.3 (120)  ·  1.2 km         │  ← rating + distance
│  🕐 18:00 - 19:30               │  ← creneau de retrait
│  ♡                    5.99€      │  ← favori + prix
│              ~~17.99€~~          │  ← prix barre (original)
└──────────────────────────────────┘
```

### Details des elements

| Element | Style | Notes |
|---------|-------|-------|
| **Image** | Ratio ~16:9 ou 4:3, coins arrondis 12-16px | Photo du magasin ou du produit |
| **Badge disponibilite** | Pill shape, fond colore | Vert = "Dispo", Gris = "Demain", Rouge = "Derniers!" |
| **Nom magasin** | Semi-bold, 14-16px | Tronque si trop long |
| **Rating** | Etoile jaune + note/5 + (nb avis) | Ex: ★ 4.3 (254) |
| **Distance** | Texte gris, 12px | "1.2 km" ou "350 m" |
| **Creneau retrait** | Icone horloge + texte | "Aujourd'hui 18:00 - 19:30" |
| **Prix** | Bold, couleur primaire teal | Prix reduit bien visible |
| **Prix original** | Barre, gris, plus petit | Montre la reduction (~1/3 du prix) |
| **Favori** | Icone coeur outline | Toggle rempli/vide au tap |
| **Ombres** | Ombres douces, floues | Elevation subtile des cartes |
| **Tag "Prix dynamique"** | Badge special | Indique que le prix varie selon la demande |

### Critique UX des cartes
- Les cartes dans "Discover" et "Explore" ont des structures differentes pour la meme info (nom, distance, prix), forgant l'utilisateur a re-apprendre le layout
- Certaines cartes sont surchargees d'information (taille du sac, dispo, nombre restant)
- Recommandation : standardiser le layout des cartes entre sections, plus de whitespace

---

## 4. Browse / Explore Screen

### Deux modes de vue

#### Vue Liste
```
[Search bar]
[Filter chips: Distance | Prix | Note | Categorie]
[Toggle: Liste | Carte]
─────────────────────────────
[Card 1 - format liste horizontal]
  [Thumbnail] [Nom | Rating | Distance | Prix]
[Card 2]
[Card 3]
...
```

#### Vue Carte (Map)
```
┌─────────────────────────────────┐
│        [Barre de recherche]     │
│  [Chips de filtre]              │
│                                 │
│      G O O G L E   M A P S     │
│                                 │
│    ●  ●      ●                  │  ← markers individuels
│         ●                       │
│    (12)        ●  ●             │  ← cluster avec nombre
│              ●                  │
│                                 │
├─────────────────────────────────┤
│  [Bottom sheet - peek state]    │
│  ← Swipe up pour liste         │
└─────────────────────────────────┘
```

### Systeme de markers carte

| Zoom | Affichage | Comportement |
|------|-----------|-------------|
| Dezoome | **Clusters** : cercles avec nombre | Ex: "(12)" = 12 magasins dans la zone |
| Intermediaire | Mix clusters + markers individuels | Transition fluide |
| Zoome | **Markers individuels** | Points colores par disponibilite |

**Couleurs des markers :**
- **Vert** : bags disponibles maintenant
- **Rouge/Gris** : pas de disponibilite actuellement
- Transitions entre zoom tres fluides (animation de separation/fusion des clusters)

### Interactions carte
- Tap sur marker → **mini-carte** du magasin en bottom sheet (peek)
- Swipe up bottom sheet → liste scrollable des resultats
- Rayon de recherche ajustable : 1 km a 30 km via slider ou geste
- Carte suit la localisation de l'utilisateur (bouton recentrage)
- Filtre accessible via icone en haut a droite

### Filtres disponibles
- **Distance** : slider 1-30 km
- **Categorie** : Repas, Boulangerie, Epicerie, Cafe
- **Disponibilite** : Aujourd'hui, Demain
- **Prix** : fourchette min-max
- **Note** : minimum 3, 4, 4.5 etoiles
- **Vegetarien/Vegan** : toggle
- **Tri** : par distance, prix, note, pertinence
- Bouton "Confirmer" en bas du panneau filtre

---

## 5. Page Detail Magasin / Surprise Bag

### Layout vertical

```
┌─────────────────────────────────┐
│  [HERO IMAGE - plein largeur]   │  ← photo du magasin, ratio 16:9
│  ← (back)           ♡ (share)  │  ← navigation overlay
├─────────────────────────────────┤
│  NOM DU MAGASIN                 │  ← 20-24px bold
│  ★ 4.3 (254 avis)              │  ← tap pour voir les avis
│  📍 1.2 km · 12 rue Example    │  ← distance + adresse
│  🕐 Retrait: 18:00 - 19:30     │  ← creneau de retrait
├─────────────────────────────────┤
│  [SECTION: Ce que vous pourriez │
│   recevoir]                     │
│  "Surprise Bag contenant des    │
│   patisseries, viennoiseries,   │
│   pain du jour..."             │
├─────────────────────────────────┤
│  [SECTION: Ce qu'il faut savoir]│
│  ▸ Ingredients    (expandable)  │
│  ▸ Allergenes     (expandable)  │
├─────────────────────────────────┤
│  [SECTION: Localisation]        │
│  [Mini-carte Google Maps]       │  ← tap → ouvre dans Maps
│  12 rue Example, 75001 Paris    │
├─────────────────────────────────┤
│  [SECTION: Horaires]            │
│  Lun-Ven: 7:00 - 20:00         │
│  Sam: 8:00 - 18:00             │
├─────────────────────────────────┤
│  [SECTION: Avis]                │
│  ★★★★☆ 4.3 basé sur 254 avis  │
│  [Avis 1] [Avis 2] [Avis 3]    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│  RESERVER    5.99€  ~~17.99€~~  │  ← bouton sticky en bas
└─────────────────────────────────┘
```

### Elements cles de la page detail

| Composant | Details |
|-----------|---------|
| **Hero image** | Pleine largeur, photo du magasin ou des produits |
| **Back button** | Fleche en haut a gauche, overlay sur l'image |
| **Favoris** | Coeur en haut a droite (critique : mal place, peu visible) |
| **Share** | Bouton partage a cote du favori |
| **Nom** | Typographie bold, grande taille |
| **Badge type** | "Repas", "Boulangerie", "Epicerie" |
| **Rating** | Etoile + note + nombre d'avis, tappable |
| **Adresse** | Icone pin + texte, tap pour navigation |
| **Creneau** | Icone horloge + plage horaire de retrait |
| **Description** | Texte libre du magasin sur le contenu possible |
| **Ingredients** | Section expandable (critique : devrait etre visible directement) |
| **Allergenes** | Section expandable (meme critique) |
| **Mini-carte** | Preview Google Maps integree |
| **Avis** | Liste scrollable, avec photo optionnelle |
| **CTA Reserve** | Bouton sticky en bas, toujours visible, couleur primaire teal |
| **Prix** | Affiche a cote du CTA : prix reduit bold + prix original barre |

### Critique UX page detail
- Le bouton favori (coeur) est mal positionne et peu visible
- Les sections "Ingredients" et "Allergenes" devraient etre ouvertes par defaut
- Le tag "Aujourd'hui" est style comme un bouton mais n'est pas cliquable (erreur de mapping)
- Le systeme d'avis manque de segmentation (qualite, quantite, valeur)

---

## 6. Favoris

### Structure
```
[En-tete: "Mes favoris"]
[Toggle: Tous | Disponibles maintenant]
─────────────────────────────
[Card 1 - meme format que Browse]
[Card 2]
[Card 3]
─────────────────────────────
[Etat vide si aucun favori]
  Illustration + texte encourageant
  "Ajoutez des magasins a vos favoris
   pour etre alerte quand ils ont
   des Surprise Bags!"
```

### Fonctionnalites
- Les favoris apparaissent aussi dans une section du Discover feed
- Notifications push quand un favori a des bags disponibles
- Icone coeur partout dans l'app (cards, detail page)
- Toggle pour filtrer les favoris dispo maintenant vs tous

---

## 7. Profil / Me

### Sections

```
[Avatar + Nom]
[Compteur d'impact]
  🌍 X meals saved
  💰 Y€ saved
  🌱 Z kg CO2e avoided
─────────────────────────────
[Mes commandes]  → historique
[Blog]           → articles TGTG
[Parametres]     → notifications, paiement, etc.
[Aide]           → FAQ, contact
─────────────────────────────
```

### Gamification / Impact
- Compteur de repas sauves avec equivalences reelles
- "Votre impact = X charges de telephone" ou "X douches chaudes"
- Illustrations colorees accompagnant les metriques
- Pas de badges/niveaux explicites (mais la communaute globale est mise en avant : "200M de repas sauves")

---

## 8. Reservation & Retrait (Flow)

### Flow complet

```
1. [Page detail] → Tap "Reserver"
2. [Popup quantite] → Selectionner 1, 2, 3...
3. [Ecran paiement] → Methode de paiement
4. [Confirmation] → Resume de la commande
   → Poster promotionnel avec partage social
5. [Attente] → Countdown timer (bouton grise)
   → Seul "Rappel" est actif
6. [Heure de retrait] → Bouton "Tap to collect" actif
7. [Bottom sheet] → ID de commande + instructions
8. [Swipe to redeem] → Glisser pour confirmer le retrait
   → Animation de confirmation
9. [Post-retrait] → Invitation a noter + photo
```

### Details UX du retrait
- **Countdown timer** : barre grise remplacant le bouton "Reserver", indique le temps restant
- **Forcing function** : impossible de confirmer le retrait avant l'heure prevue
- **Floating shortcut** : raccourci flottant sur l'ecran principal montrant la commande recente
- **Swipe gesture** : glisser avec fleche comme signifiant, empeche les taps accidentels
- **Critique** : pas de mises a jour en temps reel du vendeur (acceptation, preparation, pret)

---

## 9. Design Visuel

### Palette de couleurs

| Nom | Hex | Usage |
|-----|-----|-------|
| **Blue Stone** (Teal primaire) | `#00615F` | Boutons CTA, navigation active, headers |
| **Deep teal** (variante) | `#124C4D` | Texte sur fond clair, titres |
| **Medium teal** | `#48AEA1` | Accents secondaires, badges |
| **Vista White** (Cream) | `#F9F3F0` | Background principal, warmth |
| **Blanc** | `#FFFFFF` | Cards, surfaces |
| **Vert** | `#1DB954` (approx) | Badges "disponible", succes |
| **Jaune** | - | Etoiles de rating |
| **Rouge** | - | Badges "derniers!", alertes |
| **Gris** | - | Texte secondaire, icones inactives |

### Philosophie couleur
- Le teal profond communique **eco-conscience et confiance**
- Le cream/off-white apporte **optimisme et clarte**
- La combinaison vert/teal/cream cree une identite "nature et durabilite"
- Critique : l'app ressemble parfois trop a un "Buy! Scroll! Buy more!" generique

### Typographie

| Role | Font | Taille | Poids |
|------|------|--------|-------|
| Headlines | **Open Sans** ou **Poppins** | 20-24px | Bold (700) |
| Sous-titres | Open Sans / Poppins | 16-18px | Semi-bold (600) |
| Body | Open Sans / Poppins | 14px | Regular (400) |
| Caption | Open Sans / Poppins | 12px | Regular (400) |
| Prix | Open Sans / Poppins | 16-18px | Bold (700) |

- **Poppins** : bords arrondis, formes ouvertes → feeling playful et moderne
- Hierarchie claire : titre > sous-titre > body > caption

### Style des cartes

| Propriete | Valeur |
|-----------|--------|
| Border radius | 12-16px |
| Shadow | `0 2px 8px rgba(0,0,0,0.08)` (douce, floue) |
| Padding interne | 12-16px |
| Gap entre cartes | 12px horizontal, 16px vertical |
| Background | Blanc (#FFF) |
| Image ratio | ~16:9 ou 4:3 |
| Coin image | Arrondis en haut, droit en bas (quand attache au contenu) |

### Espacements generaux
- Marges ecran : 16px horizontal
- Espacement sections : 24-32px vertical
- Espacement elements dans carte : 8px
- Hauteur bottom tab bar : ~56px (standard iOS)
- Safe area respectee en haut et en bas

---

## 10. Patterns UX Cles

### Bottom Sheets
- **Peek state** : affiche une mini-carte ou preview quand on tap un marker sur la carte
- **Half state** : liste scrollable des resultats
- **Full state** : details complets du magasin
- Animation de spring naturelle, geste de swipe up/down
- Utilise pour : resultats carte, details commande, filtres, checkout

### Pull-to-Refresh
- Standard iOS/Android pull-to-refresh sur le feed Discover
- Le feed se met a jour en temps reel (nouvelles dispos apparaissent)
- Animation de spinner standard

### Loading States
- Pas de skeleton loading documente specifiquement
- Le feed se charge rapidement grace au CDN d'images
- Les cartes apparaissent au fur et a mesure du scroll (lazy loading)

### Animations & Transitions
- **Marker clustering** : transition fluide entre zoom in/out (separation/fusion des markers)
- **Onboarding** : texte qui glisse de droite a gauche entre les etapes
- **Swipe to redeem** : animation de confirmation apres le glissement
- **Countdown** : barre de progression animee pendant l'attente
- **Tab switching** : remplissage de l'icone active (filled vs outline)
- Pas de micro-interactions elaborees sur les boutons (critique : manque de fun)

### Gestes
- **Swipe horizontal** : navigation dans les cartes d'une section
- **Swipe vertical** : scroll du feed, expansion des bottom sheets
- **Swipe to redeem** : confirmation de retrait (anti-slip design)
- **Pinch to zoom** : carte Google Maps
- **Tap + hold** : pas documente

### Notifications
- Push quand un favori a des bags dispo
- Push post-retrait pour encourager photo/avis
- Parametrables dans les preferences

---

## 11. Onboarding

### Flow
1. **Splash screen** : logo TGTG
2. **3 ecrans educatifs** : illustrations + texte explicatif
   - Slide 1 : "Sauvez de la bonne nourriture"
   - Slide 2 : "Decouvrez des magasins pres de chez vous"
   - Slide 3 : "A prix reduit"
3. **Login/Signup** : Email, Facebook, Apple ID
   - Bouton Facebook mis en avant (filled)
   - Les autres sont outline
4. **Permission localisation** : avec pre-priming expliquant pourquoi
5. **Permission notifications** : avec pre-priming sur les alertes de dispo
6. **Verification email** : lien envoye par email

---

## 12. Points forts pour inspiration Two-Step

### A reprendre
- **Feed personnalise Netflix-style** : sections horizontales par categorie, scroll vertical entre sections
- **Double vue Liste/Carte** : toggle simple pour basculer
- **Marker clustering** : transitions fluides, couleurs par dispo
- **Bottom sheet peek** : preview quand on tap un marker
- **Carte produit standardisee** : image + nom + rating + distance + prix
- **CTA sticky** : bouton d'action toujours visible en bas de la page detail
- **Favoris avec notifications** : alertes quand un favori a du stock
- **Gamification impact** : compteur de repas sauves avec equivalences concretes
- **Palette warm teal + cream** : confiance + eco-conscience

### A ameliorer pour Two-Step
- **Standardiser les cartes** : un seul format de carte partout (TGTG en a plusieurs)
- **Whitespace** : plus d'espace dans les cartes (TGTG est parfois trop dense)
- **Favori visible** : placer le coeur de facon plus accessible
- **Transparence des infos** : pas de sections expandables pour les infos critiques
- **Micro-interactions** : ajouter du feedback haptique et des animations engageantes (TGTG est trop sobre)
- **Mises a jour temps reel** : statut du vendeur visible (TGTG n'a pas ca)
- **Onboarding** : plus percutant, TGTG est facile a skip

---

## 13. Ressources de reference

### Design files
- [Figma Community - Too Good To Go](https://www.figma.com/community/file/1112398824026178386/too-good-to-go)

### Screenshots & Inspiration
- [Mobbin - TGTG screens](https://mobbin.com/explore/screens/ae496643-7a14-498e-9098-2500bf74e3e8)
- [Mobbin - TGTG colors](https://mobbin.com/colors/brand/too-good-to-go)
- [AppShots - TGTG](https://appshots.design/apps/eat-well-fight-food-waste-app-shot-too_good_to_go/)
- [UILand - TGTG screens (28)](https://uiland.design/screens/toogoodtogo/screens/cfae1221-b965-457b-a284-5dc6792046c3)
- [Templateshake - TGTG (screenshots + interactions)](https://templateshake.com/product/too-good-to-go-end-food-waste/)
- [PageFlows - TGTG UX flows](https://pageflows.com/ios/products/too-good-to-go/)

### UX Case Studies & Critiques
- [Pratt IXD - iOS critique (2023)](https://ixd.prattsi.org/2023/02/design-critique-too-good-to-go-ios-app/)
- [Pratt IXD - Android critique (2023)](https://ixd.prattsi.org/2023/09/design-critique-too-good-to-go-android-app/)
- [Pratt IXD - Mobile critique (2026)](https://ixd.prattsi.org/2026/02/design-critique-too-good-to-go-mobile-app/)
- [Didac Noguera - Redesign eco-friendly (Nov 2025)](https://medium.com/@didacnoguerarojas/too-good-to-go-redesign-an-eco-friendly-ux-journey-ea29811154d7)
- [Behance - TGTG redesign](https://www.behance.net/gallery/135925433/Too-Good-To-Go-Mobile-Application-UXUI-redesign)
- [Morgane Favchtein - Redesign (Bootcamp)](https://medium.com/design-bootcamp/too-good-to-go-redesign-3c0c01b7786f)
- [Alyssa Long - Daily Gallery feature](https://www.alyssalong.design/project/too-good-to-go)

### Brand Assets
- [Brandfetch - TGTG logo & brand](https://brandfetch.com/toogoodtogo.at)

### Official
- [App Store](https://apps.apple.com/us/app/too-good-to-go-end-food-waste/id1060683933)
- [Google Play](https://play.google.com/store/apps/details?id=com.app.tgtg)
- [How the app works](https://www.toogoodtogo.com/en-us/how-does-the-app-work)
