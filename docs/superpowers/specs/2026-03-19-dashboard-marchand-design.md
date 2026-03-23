# Dashboard Marchand — Design Spec

## Objectif

Créer le dashboard marchand de Two-Step : l'interface web où les commerçants gèrent leur boutique, leurs produits, leur stock et leurs promotions. C'est l'outil quotidien du marchand — il doit être simple, rapide, et pensé pour des commerçants non-techniques.

## Stack technique

- **Next.js 16 App Router** — routes sous `src/app/dashboard/`
- **Supabase Auth** — email/password, session via cookies SSR
- **Untitled UI + React Aria** — composants existants dans `src/components/`
- **Tailwind CSS v4.1** — classes sémantiques du design system existant
- **API routes existantes** — backend Plan 1 en place, certaines routes nécessitent des ajouts (voir section "Modifications API")

## Architecture des routes

```
src/app/
├── auth/
│   ├── login/page.tsx          # Connexion email/password
│   └── signup/page.tsx         # Inscription + SIRET
├── dashboard/
│   ├── layout.tsx              # Sidebar slim + expand on hover
│   ├── page.tsx                # Redirect → /dashboard/products
│   ├── products/
│   │   ├── page.tsx            # Liste des produits (tableau)
│   │   ├── new/page.tsx        # Ajout produit (3 onglets)
│   │   └── [id]/edit/page.tsx  # Modification produit
│   ├── stock/page.tsx          # Vue stock + ajustement
│   ├── promotions/page.tsx     # Liste promos + création
│   ├── store/page.tsx          # Profil boutique
│   └── settings/page.tsx       # Réglages compte + POS
```

## S1 — Authentification

### S1.1 — Page de connexion (`/auth/login`)

- Formulaire : email + mot de passe
- Bouton "Se connecter"
- Lien "Pas encore de compte ? Inscrivez-vous"
- Lien "Mot de passe oublié" (Supabase reset password flow)
- En cas de succès → redirect vers `/dashboard`
- En cas d'erreur → message inline sous le formulaire
- Si déjà connecté → redirect vers `/dashboard`

### S1.2 — Page d'inscription (`/auth/signup`)

**Étape 1 — Compte**
- Email + mot de passe + confirmation mot de passe
- Validation : email valide, mot de passe ≥ 8 caractères, confirmation match

**Étape 2 — Vérification SIRET**
- Champ SIRET (14 chiffres)
- Bouton "Vérifier" → appel `POST /api/verify-siret` (proxy backend vers API INSEE)
- Si SIRET valide et actif : affiche nom entreprise, adresse, activité → pré-remplit le profil boutique
- Si SIRET invalide ou inactif : message d'erreur, le marchand peut réessayer
- Fallback : si l'API INSEE est indisponible, le compte est créé en statut "pending" avec vérification manuelle

**Étape 3 — Profil boutique (pré-rempli depuis SIRET)**
- Nom de la boutique (pré-rempli)
- Adresse complète (pré-remplie)
- Téléphone
- Géolocalisation : dérivée de l'adresse INSEE ou saisie manuelle lat/lng

**Résultat** : compte Supabase créé + merchant inséré via `POST /api/merchants` (avec champs étendus)

### S1.3 — Statuts du compte marchand

| Statut | Signification | Accès dashboard |
|---|---|---|
| `pending` | SIRET en attente de vérification | Lecture seule (peut voir, pas modifier) |
| `active` | SIRET vérifié | Accès complet |
| `suspended` | Compte suspendu par admin | Aucun accès |

### S1.4 — Middleware d'accès

- `/dashboard/*` → redirige vers `/auth/login` si non authentifié (déjà en place)
- `/dashboard/*` → affiche bandeau "Compte en attente de vérification" si statut `pending`
- `/auth/login` et `/auth/signup` → redirige vers `/dashboard` si déjà connecté

## DA — Direction Artistique

### Palette de couleurs

| Variable | Valeur | Usage |
|---|---|---|
| `--ts-sidebar-bg` | `#3D2200` | Fond sidebar (brun foncé) |
| `--ts-accent` | `#E8832A` | Accent principal (orange chaud) |
| `--ts-accent-hover` | `#D4721F` | Accent au hover |
| `--ts-accent-text` | `#C96A10` | Texte accent |
| reste | variables Tailwind existantes | Mode clair |

### Principes visuels

- **Pas de borders visibles** — l'espace et la couleur font le travail
- **Fond neutre chaud** (`#f5f5f0`) au lieu du blanc pur
- **Cartes métriques** : fond `bg-secondary`, pas de border, radius md
- **Font système** — pas d'Inter/Roboto, garder la stack système
- **Animations** : fadeUp staggeré (50ms entre chaque élément) au chargement de page

### Animations CSS globales

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Animation-delay croissants : 0.05s, 0.10s, 0.15s... pour le stagger.

### Boutons d'action

- Fond `#E8832A`, texte `#3D2200`, font-medium
- Hover : `translateY(-1px)` + background `#D4721F`
- Active : `scale(0.97)` — sensation physique au clic

### Ce qu'il ne faut PAS faire

- Pas de purple gradient sur blanc
- Pas de shadcn par défaut sans personnalisation
- Pas de borders partout
- Pas de font générique (Inter/Roboto)

## S2 — Layout Dashboard

### S2.1 — Sidebar slim + expand on hover

**Fond** : `#3D2200` (brun foncé)

**État fermé (68px)**
- Logo "T" en carré orange arrondi (36px, fond `#E8832A`, texte `#3D2200`)
- 5 icônes SVG custom : formes simples, cohérentes, tracé 1.5px, stroke `rgba(255,255,255,0.5)`
- Tooltip au survol de chaque item (quand sidebar fermée)
- Icône réglages en bas, séparée

**Icônes de navigation** (SVG inline, style cohérent tracé 1.5px) :
1. Produits → cube/package
2. Stock → barres verticales
3. Promotions → tag/étiquette
4. Ma boutique → bâtiment
5. Réglages → engrenage (en bas, séparé)

**État ouvert (180px, au survol)**
- Transition : `width 280ms cubic-bezier(.4,0,.2,1)`
- Logo complet "Two-Step" apparaît (opacity transition 200ms avec delay 80ms)
- Icônes + labels texte (labels en opacity transition)

**Item actif** :
- Barre verticale orange 3px à gauche (pseudo-element `::before`)
- Fond `rgba(232,131,42,0.18)`
- Icône en `#E8832A`
- Label en `#E8832A` font-weight 600

**Item hover** : fond `rgba(232,131,42,0.1)`

**Mobile** : sidebar cachée, hamburger menu en haut, navigation en slideout.

### S2.2 — Header de contenu

- **Eyebrow** : nom de la boutique en 11px uppercase, letter-spacing wide, text-muted — au-dessus du titre
- **Titre** : 26px font-medium, avec le mot clé coloré en orange (ex: "Mes **produits**")
- Hiérarchie : eyebrow → titre → contenu (jamais un `<h1>` seul)
- Bouton d'action principal à droite (style DA)
- Breadcrumb si sous-page

## S3 — Page Produits

### S3.1 — Liste des produits (`/dashboard/products`)

**Cartes métriques en haut** (grid 4 colonnes, style DA) :
- Total produits
- En stock
- Stock bas (valeur en orange `warn`)
- Ruptures (valeur en rouge `danger`)
- Animation fadeUp staggeré (50ms entre chaque carte)

**Barre d'action** : input recherche (fond blanc, radius 10px, focus ring orange) + bouton "+ Ajouter" (style DA)

**Liste produits** (pas un `<table>`, mais des div flex par ligne) :
- Thumbnail coloré (42x42px, radius 10px, fond pastel + emoji ou image)
- Nom du produit (14px font-600) + catégorie en dessous (12px text-muted)
- Prix (14px font-600, aligné droite)
- Badge stock : pill arrondi avec dot coloré
  - `badge-ok` : fond vert clair, texte vert foncé, dot vert (stock > 10)
  - `badge-low` : fond ambre clair, texte ambre foncé, dot orange (stock 1-10)
  - `badge-out` : fond rouge clair, texte rouge foncé, dot rouge (stock = 0, texte "Rupture")
- Flèche `→` : invisible par défaut, apparaît au hover de la ligne

**Hover ligne** : fond `#faf9f5` + box-shadow subtil `0 0 0 1px rgba(0,0,0,0.04)`

**Animations** : chaque ligne en fadeUp staggeré (50ms entre chaque)

**Fonctionnalités :**
- Recherche par nom (filtre client-side)
- État vide : illustration + message "Aucun produit encore" + CTA
- Chargement : skeletons sur les lignes
- Pagination : différée, client-side suffisant pour MVP

**Data** : `GET /api/products?merchant_id={id}` — retourne les produits avec `stock(quantity)` joint. Le merchant_id est dérivé de la session côté client via `useMerchant`.

### S3.2 — Ajout de produit (`/dashboard/products/new`)

**3 onglets en haut de page :**

**Onglet 1 — Import facture** (désactivé, badge "Bientôt")
- Zone de drop grisée avec message "Disponible prochainement"
- Réservé pour Plan 4 (parser IA)

**Onglet 2 — Scan EAN** (désactivé, badge "Bientôt")
- Champ EAN grisé avec message "Disponible prochainement"
- Réservé pour intégration API Open Food Facts

**Onglet 3 — Saisie manuelle** (actif par défaut)
- Nom du produit* (requis)
- Description (textarea, optionnel)
- Code EAN (optionnel, pour référence future)
- Catégorie (select avec suggestions : Alimentation, Cosmétique, Hygiène, Textile, Décoration, Autre)
- Prix de vente* (requis, en euros, validation >= 0)
- Quantité initiale en stock (nombre, défaut 0)
- Photo (upload vers Supabase Storage, preview avant envoi — voir S8.3)
- Boutons : "Annuler" (retour liste) + "Créer le produit" (submit)

**Submit** : `POST /api/products` avec les champs + `initial_quantity`

### S3.3 — Modification de produit (`/dashboard/products/[id]/edit`)

- Même formulaire que S3.2 onglet Manuel, pré-rempli avec les données existantes
- Composant formulaire partagé entre new et edit (`ProductForm`)
- Data : `GET /api/products/{id}` pour charger les données existantes
- Submit : `PATCH /api/products/{id}`
- Bouton "Supprimer ce produit" en bas, avec confirmation modale

## S4 — Page Stock

### S4.1 — Vue d'ensemble (`/dashboard/stock`)

**Métriques en haut :**
- Total produits
- Produits en stock
- Alertes stock bas (< 5 unités)
- Ruptures (= 0)

**Tableau des produits avec stock :**
- Nom du produit
- Stock actuel (badge couleur)
- Champ d'ajustement inline : boutons +/- pour ajustement rapide
- Input numérique pour valeur absolue

**Data** : stock chargé via `GET /api/products?merchant_id={id}` (inclut `stock(quantity)` dans la réponse).

**Ajustement** : `PATCH /api/stock` avec `{ product_id, delta: +1 }` ou `{ product_id, quantity: N }`

## S5 — Page Promotions

### S5.1 — Liste et création (`/dashboard/promotions`)

**Liste des promos actives :**
- Nom du produit
- Prix original → Prix promo (`sale_price`) (barré → nouveau)
- Date début / Date fin
- Statut : Active (en cours) / Programmée (starts_at dans le futur)
- Bouton supprimer (fin anticipée)

Note : les promotions expirées ne sont pas affichées (filtrées côté API). Les promotions ne sont pas modifiables — pour changer une promotion, la supprimer et en créer une nouvelle.

**Formulaire de création (section dépliable sous la liste) :**
- Select produit (parmi les produits du marchand)
- Prix promotionnel (`sale_price`)* — validation : doit être < prix original, > 0
- Date de début (défaut : maintenant)
- Date de fin (optionnel : si vide = promo illimitée)
- Bouton "Lancer la promotion"

**Data** :
- Liste : `GET /api/promotions?merchant_id={id}`
- Créer : `POST /api/promotions`
- Supprimer : `DELETE /api/promotions/{id}`

## S6 — Page Ma boutique

### S6.1 — Profil boutique (`/dashboard/store`)

**Formulaire d'édition :**
- Nom de la boutique
- Adresse (rue, code postal, ville)
- Téléphone
- Description courte (ce que la boutique propose)
- Photo de la boutique (upload vers Supabase Storage — voir S8.3)
- Horaires d'ouverture (7 jours, heure début/fin ou "Fermé")

**Statut SIRET :**
- Badge "Vérifié" (vert) ou "En attente" (orange)
- Numéro SIRET affiché (non modifiable)

**Géolocalisation :**
- Latitude / Longitude (pré-remplis depuis l'inscription)
- Bouton "Utiliser ma position actuelle" (Geolocation API du navigateur)

**Submit** : `PATCH /api/merchants/{id}`

### S6.2 — Aperçu public

- Preview de comment la boutique apparaîtra dans l'app consommateur
- Image statique de carte (Mapbox static image API ou placeholder pour le moment)

## S7 — Page Réglages

### S7.1 — Réglages (`/dashboard/settings`)

**Section Compte :**
- Email actuel (non modifiable pour l'instant)
- Changer le mot de passe : nouveau mot de passe + confirmation. Utilise `supabase.auth.updateUser({ password })` (l'utilisateur est déjà authentifié, pas besoin de l'ancien mot de passe).

**Section Caisse (POS) :**
- Statut : "Non connecté" / "Connecté à Square"
- Bouton "Connecter ma caisse" (désactivé, badge "Bientôt" — Plan 2)
- Liste des POS supportés avec statut : Square (bientôt), SumUp (bientôt), Zettle (bientôt)

**Section Abonnement :**
- Plan actuel : "Gratuit (beta)"
- Message : "L'abonnement sera disponible au lancement officiel"

Note : la suppression de compte est différée (nécessite cascade delete complexe + confirmation sécurisée). Hors périmètre Plan 3.

## S8 — Composants et patterns partagés

### S8.1 — Composants à créer

| Composant | Usage |
|---|---|
| `DashboardSidebar` | Layout sidebar slim + expand |
| `PageHeader` | Titre + action + breadcrumb |
| `DataTable` | Tableau générique avec tri et recherche |
| `StockBadge` | Badge coloré selon niveau de stock |
| `EmptyState` | Illustration + message + CTA |
| `StatusBadge` | Badge statut (active, pending) |
| `FormSection` | Conteneur de section de formulaire |
| `TabNav` | Navigation par onglets (pour page ajout produit) |
| `ProductForm` | Formulaire produit partagé (new + edit) |

### S8.2 — Hooks à créer

| Hook | Usage |
|---|---|
| `useMerchant` | Fetch le merchant connecté, cache client-side |
| `useProducts` | CRUD produits avec refresh automatique |
| `usePromotions` | CRUD promotions |

Note : pas de hook `useStock` séparé — les données stock sont incluses dans la réponse produits (`stock(quantity)`).

### S8.3 — Upload de fichiers

- **Storage** : Supabase Storage, bucket `product-photos` (public) et `store-photos` (public)
- **Upload flow** : upload direct depuis le client via `supabase.storage.from('bucket').upload()`, récupération de l'URL publique, sauvegarde de l'URL dans le champ `photo_url`
- **Contraintes** : max 5 Mo, formats acceptés JPEG/PNG/WebP
- **Preview** : affichage de la preview locale avant upload (URL.createObjectURL)

### S8.4 — Feedback et gestion d'erreurs

- **Toast notifications** : messages de succès ("Produit créé") et d'erreur ("Échec de la mise à jour") via un composant toast simple
- **Loading states** : boutons en `isLoading` pendant les requêtes API, skeletons pour le chargement initial des pages
- **Erreurs réseau** : message inline avec bouton "Réessayer"
- **Validation formulaire** : validation côté client avant submit, messages d'erreur inline sous chaque champ

## Modifications API requises

Les API routes du Plan 1 nécessitent les ajouts suivants :

### Nouvelle route : `POST /api/verify-siret`
- Reçoit `{ siret: string }`
- Proxy vers API INSEE (api.insee.fr/entreprises/sirene/V3)
- Retourne les infos entreprise (nom, adresse, activité, statut) ou erreur

### Modifications `merchants` routes
- **POST** `/api/merchants` : accepter les nouveaux champs `siret`, `phone`, `description`, `photo_url`, `opening_hours`, `status`
- **PATCH** `/api/merchants/[id]` : accepter les mêmes champs
- **GET** `/api/merchants` et `/api/merchants/[id]` : retourner tous les champs (supprimer le `.select()` restrictif)

### Mise à jour types TypeScript
- `src/lib/types.ts` : ajouter `status`, `siret`, `phone`, `description`, `photo_url`, `opening_hours` au type `Merchant`

## Migration base de données

Migration `002_dashboard_fields.sql` :

Ajouts à la table `merchants` :
- `status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended'))`
- `siret TEXT`
- `phone TEXT`
- `description TEXT`
- `photo_url TEXT`
- `opening_hours JSONB`

Note : le statut par défaut est `active` pour simplifier le MVP. La vérification SIRET passera le statut à `pending` si l'API INSEE échoue.

## Hors périmètre (Plan 3)

- Import facture IA (Plan 4)
- Scan EAN / Open Food Facts
- Connexion POS (Plan 2)
- Abonnement Stripe
- Dashboard admin (vérification manuelle des comptes)
- App consommateur
- Notifications en temps réel
- Internationalisation
- Suppression de compte (cascade complexe)
- Pagination serveur (client-side suffisant pour MVP)
- Dark mode (design system le supporte, activé plus tard)
