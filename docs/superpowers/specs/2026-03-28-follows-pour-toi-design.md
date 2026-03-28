# Follows Instagram-like + "Pour toi" + Suggestions d'amélioration — Design spec

## Contexte

La consumer app Two-Step a actuellement un système favoris/follows fonctionnel mais pas assez intuitif. Le coeur sur la page boutique prête à confusion (follow ≠ favori produit). L'objectif : adopter les patterns Instagram que tout le monde connaît — bouton "S'abonner" explicite, onglet "Pour toi" sur l'accueil, et favoris réservés aux produits.

De plus, on ajoute un système de suggestions d'amélioration : les consommateurs peuvent laisser un retour constructif au marchand. Pas de notes, pas d'étoiles, pas de jugement — uniquement des axes d'amélioration bienveillants. Une IA (Groq/Llama 3.3, déjà utilisé pour les coach tips) filtre tous les messages avant qu'ils n'arrivent au marchand.

## Changements

### 1. Page Accueil (Discover) — toggle "Pour toi" / "Suivis"

**Fichier :** `src/app/(consumer)/discover/page.tsx`

Ajouter un toggle en haut de la page, sous le header, même style que le toggle Carte/Liste de la page Explore.

#### Onglet "Pour toi" (défaut)
- Contenu identique au feed Discover actuel (promos, trending, nearby, catégories)
- Aucun changement fonctionnel — c'est un renommage de la vue actuelle

#### Onglet "Suivis"
- Liste des boutiques suivies par l'utilisateur
- Chaque boutique affichée comme une carte : photo, nom, ville, distance
- Si aucun follow : empty state avec CTA "Explorer les boutiques"
- Utilise le hook `useFollows()` existant

#### Style du toggle
- Deux boutons pill côte à côte, centrés en haut
- Actif : fond ochre `var(--ts-ochre)`, texte blanc, font-weight 600
- Inactif : fond transparent, texte `#f0dfc0/50`, font-weight 500
- Le scroll du contenu est indépendant pour chaque tab

### 2. Page boutique — bouton "S'abonner" style Instagram

**Fichier :** `src/app/(consumer)/shop/[id]/shop-profile.tsx`

#### Retirer
- Le bouton coeur en haut à droite du cover (lignes ~160-174)

#### Ajouter
- Bouton "S'abonner" / "Abonné" sous le nom de la boutique, à côté du bouton Partager existant (ou dans une row dédiée)

#### Style du bouton
- **Non abonné :** fond ochre `var(--ts-ochre)`, texte blanc, border-radius 8px, padding 8px 20px, texte "S'abonner" en 13px font-weight 600
- **Abonné :** fond `#2a1a08`, border `1px solid #f0dfc0/20`, texte `#f0dfc0/70`, texte "Abonné ✓" en 13px font-weight 500
- Transition smooth au toggle (150ms)
- Touch target minimum 44px de hauteur

#### Compteur followers (optionnel, V1 simple)
- Sous le bouton ou à côté du nom : "X abonnés" en texte 11px, couleur tertiaire
- Requête count sur la table `follows` filtrée par `merchant_id`

### 3. Page Favoris — uniquement les produits

**Fichier :** `src/app/(consumer)/favorites/page.tsx`

#### Retirer
- L'onglet "Boutiques" et toute la logique tabs `produits` / `boutiques`
- L'import et l'utilisation de `useFollows` / `useToggleFollow`
- Le state `activeTab` et le rendu conditionnel par tab

#### Garder
- Le titre "Favoris" avec le logo
- La liste des produits favoris (coeur)
- L'empty state avec suggestions (en adaptant le texte — retirer la mention boutiques)

#### Résultat
- Page simple : header + liste de produits aimés
- Le coeur sur un produit = favori (inchangé partout dans l'app)

### 4. Tab bar — inchangée

Les 4 onglets restent identiques :
- Accueil (Home02) → `/discover`
- Carte (MarkerPin01) → `/explore`
- Favoris (Heart) → `/favorites`
- Profil (User01) → `/profile`

### 5. Suggestions d'amélioration — feedback privé filtré par IA

#### Concept
Le consommateur peut laisser une suggestion d'amélioration à un marchand. Ce n'est PAS un avis public, PAS une note — c'est un message privé, visible uniquement par le marchand, filtré par IA pour ne garder que le constructif.

Pas d'étoiles, pas de notation. Texte libre uniquement. L'objectif n'est pas de juger mais d'aider le marchand à progresser.

#### UX côté consommateur

**Fichier :** `src/app/(consumer)/shop/[id]/shop-profile.tsx`

- Bouton "Suggérer une amélioration" en bas de la page boutique, après les produits
- Style discret : texte 12px, couleur tertiaire, icône message — pas proéminent
- Au clic : ouvre un bottom sheet (vaul Drawer, déjà utilisé dans l'app)
- Le bottom sheet contient :
  - Titre : "Aidez cette boutique à s'améliorer"
  - Sous-titre : "Votre message est privé et sera relu avant d'être transmis."
  - Textarea : placeholder "Ex : Ce serait super d'avoir plus de photos des produits…"
  - Bouton "Envoyer" (ochre)
  - Limite : 500 caractères max
- Après envoi : toast "Merci pour votre suggestion !" — le même message que ce soit accepté ou rejeté par l'IA (le consommateur ne sait jamais si c'est rejeté)

#### Filtrage IA (Groq Cloud — Llama 3.3)

**Fichier :** `src/app/api/suggestions/route.ts`

À l'envoi, la route API appelle Groq avec ce prompt système :

```
Tu es un filtre de suggestions pour des boutiques locales.
Tu reçois un message d'un consommateur destiné au marchand.

Règles :
- Si le message est constructif, bienveillant et contient un axe d'amélioration concret → réponds "pass"
- Si le message est insultant, méchant, vulgaire, moqueur ou sans fond constructif → réponds "reject"
- Si le message a un fond valide mais un ton négatif → reformule-le de façon bienveillante et constructive, en gardant le sens. Réponds "rewrite:" suivi de ta version.

Réponds UNIQUEMENT "pass", "reject", ou "rewrite: [texte reformulé]".
```

Trois issues :
- `pass` → le message original est stocké en base, visible par le marchand
- `rewrite: ...` → la version reformulée est stockée, l'original est gardé dans un champ `original_text` (pour audit)
- `reject` → rien n'est stocké, le consommateur voit quand même "Merci"

#### Base de données

**Migration :** `supabase/migrations/022_suggestions.sql`

```sql
create table public.suggestions (
    id uuid primary key default gen_random_uuid(),
    merchant_id uuid not null references merchants(id) on delete cascade,
    consumer_id uuid references auth.users(id) on delete set null,
    text text not null,
    original_text text,
    status text not null default 'visible' check (status in ('visible', 'archived')),
    created_at timestamptz not null default now()
);

alter table public.suggestions enable row level security;

-- Le marchand voit ses suggestions
create policy "Merchants read own suggestions"
    on suggestions for select
    using (merchant_id in (select id from merchants where user_id = auth.uid()));

-- Les consommateurs connectés peuvent envoyer
create policy "Authenticated users can insert suggestions"
    on suggestions for insert
    with check (auth.uid() is not null);
```

#### UX côté dashboard marchand

**Fichier :** `src/app/dashboard/page.tsx` (widget) + future page dédiée

V1 simple : un widget "Dernières suggestions" sur le dashboard accueil, sous les coach tips.
- Affiche les 3 dernières suggestions (texte + date relative)
- Lien "Voir tout" → page `/dashboard/suggestions` (V2, hors scope V1)
- Le marchand peut archiver une suggestion (pas supprimer — l'archiver)

## Ce qui ne change PAS

- Les hooks `useFollows` / `useToggleFollow` et `useFavorites` / `useToggleFavorite` — déjà bien séparés
- Les API routes `/api/follows` et `/api/favorites` — inchangées
- Les tables Supabase `follows` et `favorites` — inchangées
- Le coeur sur les cartes produit dans tout l'app — c'est un favori produit, ça reste
- La page Carte/Explore — inchangée
- La page Profil — inchangée

## Stack technique

- Hooks existants : `useFollows()`, `useFavorites()`
- Toggle component : CSS pill buttons (pas de lib externe)
- Groq Cloud API (Llama 3.3) pour le filtrage des suggestions — déjà en place pour les coach tips
- vaul (Drawer) pour le bottom sheet suggestion — déjà installé
- 1 nouvelle table Supabase : `suggestions`
- 1 nouvelle route API : `POST /api/suggestions`

## Hors scope

- Notifications "nouvelle arrivée" des boutiques suivies
- Feed algorithmique personnalisé dans "Pour toi"
- Stories boutiques
- Compteur followers côté dashboard marchand (déjà dans le DiscoveryFunnel)
- Page dédiée `/dashboard/suggestions` (V2)
- Réponse du marchand aux suggestions (V2)
- Suggestions anonymes (V1 = connecté obligatoire pour éviter le spam)
