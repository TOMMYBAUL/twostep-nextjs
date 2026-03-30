# Two-Step V2 — 3 Features Design Spec

> Date: 2026-03-30
> Status: Validé par Thomas
> Scope: 3 features — onglets discover, bouton "J'arrive", stories boutique

---

## Feature 1 — Onglets Explorer / Pour toi / Suivis

### Résumé

Le discover page passe de 2 onglets (Pour toi / Suivis) à 3 onglets :

| Onglet | Contenu | Filtre taille |
|---|---|---|
| **Explorer** | Feed général par proximité (ancien "Pour toi") | Manuel (comme aujourd'hui) |
| **Pour toi** | Produits des boutiques suivies, triés promos first | Auto depuis le profil |
| **Suivis** | Produits des boutiques suivies, tous produits | Manuel (pour chercher pour quelqu'un d'autre) |

### Comportement "Pour toi"

1. Au montage, fetch `GET /api/consumer/preferences` pour récupérer `preferred_clothing_size` et `preferred_shoe_size`
2. Pré-appliquer ces tailles comme filtres par défaut dans le FollowedFeed
3. L'utilisateur peut toujours modifier le filtre manuellement par-dessus
4. Si l'utilisateur n'a pas de taille enregistrée → afficher un bandeau discret "Renseigne ta taille pour un feed personnalisé" avec lien vers le profil
5. Tri : produits en promo d'abord, puis par date de création (plus récent en premier)

### Modifications code

- `src/app/(consumer)/discover/page.tsx` :
  - Renommer le tab "Pour toi" → "Explorer"
  - Ajouter un tab "Pour toi" au milieu
  - Créer un composant `ForYouFeed` qui :
    - Fetch les préférences utilisateur (clothing_size, shoe_size)
    - Appelle `/api/products/by-merchants` avec les tailles auto-injectées
    - Affiche les promos en premier (tri côté client ou param API)
  - L'onglet "Suivis" reste identique (composant `FollowedFeed` existant)

- `src/app/api/products/by-merchants/route.ts` :
  - Ajouter un param `promo_first=true` qui trie les produits avec promo avant les autres
  - Ajouter support pour filtrer par `clothing_size` ET `shoe_size` simultanément (actuellement un seul param `size`)

### DB

Aucune migration nécessaire. Les préférences existent déjà dans `consumer_profiles`.

---

## Feature 2 — Bouton "J'arrive" (signal d'intention)

### Résumé

Bouton sur la fiche produit qui envoie un signal d'intention au marchand. Ce n'est PAS une réservation — le marchand n'est pas obligé de bloquer le produit.

### Conditions d'affichage

Le bouton "J'arrive" est visible sur la fiche produit **uniquement si** :
- L'utilisateur est connecté
- Une taille est sélectionnée (si le produit a des tailles)
- Le produit est en stock

Si le produit n'a pas de tailles (ex: bijou, accessoire), le bouton est visible directement.

### Flow utilisateur

1. L'utilisateur est sur la fiche produit, sélectionne une taille
2. Il appuie sur "J'arrive"
3. Confirmation animée : "Le commerçant est prévenu ! Sous réserve de disponibilité."
4. Le bouton passe en état "Envoyé ✓" (désactivé, pas de double envoi)
5. Le signal expire automatiquement après 2h

### Flow marchand

1. Notification dans le dashboard (section notifications) : "[Prénom] est intéressé par [Produit] en taille [X] — il arrive d'ici 1h"
2. Email envoyé via Resend à l'adresse du marchand
3. Push notification web (système existant)
4. Le marchand ne fait rien de spécial — c'est juste une info

### DB — Nouvelle table `intent_signals`

```sql
CREATE TABLE intent_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    selected_size TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '2 hours'
);

-- RLS: user can insert/read own signals, merchant can read signals for their products
ALTER TABLE intent_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create intent signals"
    ON intent_signals FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own intent signals"
    ON intent_signals FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Merchants can read their intent signals"
    ON intent_signals FOR SELECT TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- Index for merchant dashboard queries
CREATE INDEX idx_intent_signals_merchant ON intent_signals(merchant_id, created_at DESC);
CREATE INDEX idx_intent_signals_expires ON intent_signals(expires_at) WHERE status = 'active';
```

### API

**POST `/api/intents`**
- Body: `{ product_id, merchant_id, selected_size }`
- Auth: required (consumer)
- Actions :
  1. Insert dans `intent_signals`
  2. Envoyer email au marchand via Resend (template : "[Prénom] arrive pour [Produit] taille [X]")
  3. Envoyer push notification au marchand (système web push existant)
  4. Retourner `{ intent_id, expires_at }`
- Rate limit : max 5 signaux par utilisateur par heure

**GET `/api/merchants/[id]/intents`**
- Auth: required (merchant owner)
- Retourne les signaux actifs (non expirés) pour ce marchand
- Utilisé par le dashboard

### Composant frontend

- `src/app/(consumer)/product/[id]/product-detail.tsx` :
  - Bouton "J'arrive" sous le sélecteur de taille
  - Style : fond bleu #4268FF, texte blanc, icône direction/flèche
  - État loading pendant l'envoi
  - État "Envoyé ✓" après succès (grisé, désactivé)
  - Si pas connecté → ouvre le welcome-gate
  - Si pas de taille sélectionnée (et produit avec tailles) → shake le sélecteur de taille

- Dashboard marchand — section notifications :
  - Afficher les intent signals actifs avec : photo produit, nom produit, taille, prénom utilisateur, heure, "il arrive d'ici Xh"

---

## Feature 3 — Stories boutique

### Résumé

Les marchands peuvent publier des mini-stories (1 image + texte court) visibles 48h. Optionnel, jamais obligatoire. Architecture inspirée d'Instagram.

### DB — Nouvelle table `merchant_stories`

```sql
CREATE TABLE merchant_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT CHECK (char_length(caption) <= 280),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours'
);

ALTER TABLE merchant_stories ENABLE ROW LEVEL SECURITY;

-- Merchants can manage their own stories
CREATE POLICY "Merchants can insert own stories"
    ON merchant_stories FOR INSERT TO authenticated
    WITH CHECK (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

CREATE POLICY "Merchants can delete own stories"
    ON merchant_stories FOR DELETE TO authenticated
    USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));

-- Anyone can read non-expired stories
CREATE POLICY "Anyone can read active stories"
    ON merchant_stories FOR SELECT
    USING (expires_at > NOW());

CREATE INDEX idx_stories_merchant ON merchant_stories(merchant_id, created_at DESC);
CREATE INDEX idx_stories_active ON merchant_stories(expires_at) WHERE expires_at > NOW();
```

### Côté marchand (dashboard)

- Nouvelle section "Stories" dans le dashboard (ou bouton "Publier une story" en haut)
- Formulaire simple :
  - Upload image (via Supabase Storage, bucket `stories`)
  - Champ texte (max 280 caractères)
  - Bouton "Publier"
- Liste des stories actives avec bouton supprimer
- Fonctionne sur desktop et mobile (dashboard responsive)

### API

**POST `/api/stories`**
- Body: `FormData` avec `image` (file) + `caption` (text)
- Auth: required (merchant)
- Actions : upload image vers Supabase Storage → insert dans `merchant_stories`

**GET `/api/stories?merchant_ids=x,y,z`**
- Retourne les stories actives (non expirées) des marchands demandés
- Utilisé par le feed "Pour toi" consumer

**DELETE `/api/stories/[id]`**
- Auth: required (merchant owner)

### Côté consommateur

**Barre de stories (feed "Pour toi") :**
- En haut du feed "Pour toi", barre horizontale scrollable de cercles (style Instagram)
- Chaque cercle = logo/photo de la boutique avec bordure bleue si story non vue
- Tap → ouvre la story en plein écran (image + caption en overlay bas + nom boutique)
- Swipe gauche → story suivante (même boutique ou boutique suivante)
- Tap sur le nom de la boutique → page boutique
- Si aucune story active → la barre ne s'affiche pas

**Page boutique (shop-profile) :**
- Si la boutique a des stories actives → cercle story en haut du profil (même style)
- Tap → même viewer plein écran

### Stockage images

- Bucket Supabase Storage : `stories`
- Politique : marchands authentifiés peuvent upload dans leur dossier (`merchant_id/`)
- Compression côté client avant upload (max 1080px de large, qualité 80%)
- Pas de CDN supplémentaire en V1 — Supabase Storage suffit

### Ce qu'on NE fait PAS en V1

- Pas de compteur de vues
- Pas de réactions/likes sur les stories
- Pas de story highlights (archivage)
- Pas de vidéo (photo uniquement)
- Pas de génération semi-automatique depuis le POS (V2)

---

## Ordre d'implémentation

1. **Feature 1 — Onglets** (~2-3h) : refactor léger du discover page, pas de migration DB
2. **Feature 2 — "J'arrive"** (~4-5h) : migration DB, API, bouton frontend, notifications
3. **Feature 3 — Stories** (~5-6h) : migration DB, storage, API, composants dashboard + consumer

---

## Fichiers impactés (estimation)

| Feature | Fichiers |
|---|---|
| Onglets | `discover/page.tsx` (refactor), `by-merchants/route.ts` (tri promos) |
| J'arrive | nouvelle migration, `api/intents/route.ts` (nouveau), `product-detail.tsx`, `dashboard/page.tsx` |
| Stories | nouvelle migration, `api/stories/route.ts` (nouveau), composant `StoryBar`, composant `StoryViewer`, `dashboard/stories/page.tsx` (nouveau), `shop-profile.tsx` |
