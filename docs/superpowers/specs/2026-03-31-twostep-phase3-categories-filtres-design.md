# Two-Step — Phase 3 : Audit catégories, filtres & auto-catégorisation

> Spec validée le 31 mars 2026 — Phase 3 du redesign frontend

---

## 1. Arbre de catégories hiérarchique (2 niveaux, en DB)

### Principe
Les catégories vivent dans une table Supabase, jamais en dur dans le code. On peut ajouter une catégorie ou sous-catégorie sans toucher le frontend.

### 15 catégories niveau 1

| # | Catégorie | Emoji | Sous-catégories |
|---|-----------|-------|-----------------|
| 1 | Mode | 👗 | Femme, Homme, Enfant, Lingerie, Grande taille, Vintage, Cérémonie |
| 2 | Chaussures | 👟 | Sneakers, Ville, Sport, Enfant, Bottes, Sandales |
| 3 | Beauté | 💄 | Parfums, Maquillage, Soins, Cheveux, Barbe, Bio / Naturel |
| 4 | Bijoux & Accessoires | 💎 | Bijoux, Montres, Lunettes, Sacs, Maroquinerie, Chapeaux |
| 5 | Sport & Outdoor | ⚽ | Running, Vélo, Fitness, Raquettes, Montagne, Glisse, Équitation, Arts martiaux |
| 6 | Tech & Électronique | 📱 | Téléphones, Audio / Hi-Fi, Photo, Gaming, Informatique, Domotique |
| 7 | Maison & Déco | 🏠 | Déco, Cuisine, Linge, Luminaires, Bougies, Literie, Jardin |
| 8 | Alimentation | 🍷 | Vins & Spiritueux, Épicerie fine, Thé & Café, Bio, Chocolat, Bière craft |
| 9 | Enfants | 🧸 | Jouets, Puériculture, Jeux de société, Figurines, Modélisme |
| 10 | Culture & Loisirs | 📚 | Livres, BD & Manga, Vinyles, Instruments, Papeterie, Beaux-arts |
| 11 | Santé & Bien-être | 💊 | Pharmacie, Optique, Parapharmacie, Herboristerie, Nutrition sportive |
| 12 | Animaux | 🐾 | Chien & Chat, Aquariophilie, Équitation |
| 13 | Auto & Mobilité | 🚗 | Accessoires auto, Moto, Vélo électrique, Trottinette |
| 14 | Bricolage & Jardin | 🔧 | Outillage, Quincaillerie, Peinture, Jardinerie, Piscine |
| 15 | Seconde main | ♻️ | Dépôt-vente luxe, Tech reconditionné, Brocante |

### Table Supabase

```sql
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    emoji TEXT,
    parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent ON categories(parent_id, sort_order);
```

- `parent_id = NULL` → catégorie niveau 1
- `parent_id = <uuid>` → sous-catégorie
- `is_active` permet de masquer une catégorie sans la supprimer
- `sort_order` contrôle l'ordre d'affichage

---

## 2. Filtres dynamiques

### 2.1 Filtres universels (toujours affichés)

| Filtre | Type | Valeurs |
|--------|------|---------|
| Distance | Slider / pills | 1km, 2km, 5km, 10km, 20km |
| Prix | Range (min-max) | Slider double |
| En promo | Toggle | Oui / Non |
| Tri | Select | Pertinence, Prix ↑, Prix ↓, Distance, Récent |

### 2.2 Filtres contextuels (selon la catégorie)

| Filtre | Type | Apparaît quand | Source |
|--------|------|----------------|--------|
| Taille vêtements | Pills multi-select | Mode, Sport | Tag auto-extrait du nom POS (déjà implémenté : `extract-size.ts`) |
| Pointure | Pills multi-select | Chaussures | Tag auto-extrait |
| Marque | Pills multi-select (scrollable) | Toutes (si marques détectées) | EAN lookup + tag auto-extrait |
| Couleur | Pastilles couleur | Mode, Chaussures, Déco | Tag auto-extrait du nom |
| Genre | Pills | Mode, Chaussures, Beauté | Tag auto-extrait |
| État | Pills | Seconde main, Tech | Tag auto-extrait ou marchand |

### 2.3 Filtres exclusifs Two-Step

| Filtre | Type | Description |
|--------|------|-------------|
| En stock maintenant | Toujours actif par défaut | Seuls les produits avec stock > 0 (données POS temps réel) |
| Ouvert maintenant | Toggle | Filtre les boutiques par horaires d'ouverture |
| Temps de marche | Affichage | "À 5 min à pied" au lieu de "à 400m" |
| Stock réel | Badge | "Plus que 2 en magasin" quand stock ≤ 3 |

### Règle d'affichage des filtres

- Un filtre contextuel n'apparaît **que si au moins 1 produit** dans les résultats courants possède ce tag
- Les valeurs d'un filtre ne montrent **que les valeurs qui existent** dans les résultats (pas de filtre "Nike" si aucun produit Nike dans le rayon)
- Le compteur de résultats est mis à jour en temps réel dans le bouton "Voir les résultats (N)"

---

## 3. Auto-catégorisation full auto par IA

### Pipeline

1. **POS sync** — Les produits arrivent avec nom, prix, EAN, photo *(déjà implémenté)*
2. **EAN lookup** — UPCitemdb retourne marque et catégorie standard *(déjà implémenté)*
3. **Extraction taille** — `extract-size.ts` extrait la taille du nom *(déjà implémenté)*
4. **IA batch** — Un appel à Claude Haiku avec tous les noms de produits du marchand. Retourne pour chaque produit : catégorie, sous-catégorie, marque, genre, couleur, tags
5. **Catégorie marchand** — Déduite automatiquement : la catégorie la plus fréquente parmi ses produits

### Prompt IA (batch)

Le prompt reçoit :
- La liste des noms de produits (max 200)
- Les prix
- Les marques connues (via EAN)
- L'arbre de catégories valide (depuis la table `categories`)

Il retourne un JSON avec pour chaque produit :
- `category_slug` — slug de la catégorie niveau 1
- `subcategory_slug` — slug de la sous-catégorie (nullable)
- `brand` — marque détectée (nullable)
- `color` — couleur détectée (nullable)
- `gender` — genre détecté : homme / femme / mixte / enfant (nullable)
- `tags` — tableau de tags libres
- `confidence` — score de confiance 0-100

### Filet de sécurité

- **Confiance < 70%** → produit marqué "Non catégorisé" dans le dashboard
- **Page dashboard "Vérifier vos catégories"** → le marchand voit les catégories assignées et peut corriger d'un tap (optionnel)
- **Fallback règles** — Si l'API IA est indisponible, un système de mots-clés basique fait le travail (mapping mot-clé → catégorie)
- **Apprentissage** — Chaque correction marchand est stockée dans une table `category_corrections` pour améliorer les futures attributions

### Coût (pour Two-Step, transparent pour le marchand)

- ~0.01€ par marchand (200 produits, 1 appel batch Claude Haiku) — payé par Two-Step
- ~1€ pour 100 marchands au lancement Toulouse
- 1 seule fois par produit (résultat en cache, re-run si nom change)
- Le marchand ne paie rien et ne voit rien de ce mécanisme — c'est inclus dans le service
- Re-catégorisation possible manuellement depuis le dashboard

### Tables Supabase

```sql
-- Tags sur les produits
CREATE TABLE product_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tag_type TEXT NOT NULL, -- 'brand', 'color', 'gender', 'style', 'material', 'custom'
    tag_value TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ai', -- 'ai', 'ean', 'merchant', 'rule'
    confidence INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_tags_product ON product_tags(product_id);
CREATE INDEX idx_product_tags_type_value ON product_tags(tag_type, tag_value);

-- Catégorie assignée au produit
ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_categorized_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ai_confidence INTEGER;

-- Catégorie(s) du marchand (déduite automatiquement)
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS primary_category_id UUID REFERENCES categories(id);

-- Corrections marchands (pour apprentissage)
CREATE TABLE category_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    original_category_id UUID REFERENCES categories(id),
    corrected_category_id UUID NOT NULL REFERENCES categories(id),
    merchant_id UUID NOT NULL REFERENCES merchants(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Navigation consumer — Pills dynamiques + drawer

### Onglet Accueil (Explorer / Pour toi / Suivis)

- **6-8 pills** affichés horizontalement en haut de l'onglet Explorer
- Les pills affichés sont **dynamiques** — les catégories avec le plus de produits dans le rayon de l'utilisateur
- Dernier pill : bouton **"Tout ▾"** (bordure bleue, pas rempli) → ouvre le drawer
- Au tap sur un pill → filtre le feed par cette catégorie
- Au tap sur un pill déjà actif → désactive le filtre (retour à "Tout")

### Drawer "Toutes les catégories"

- **Bottom sheet** (Vaul) qui slide depuis le bas
- Liste des 15 catégories avec emoji + label
- Chaque catégorie est un **accordéon** — tap → les sous-catégories se déroulent en dessous en pills
- Tap sur une sous-catégorie → filtre appliqué, drawer se ferme
- Seules les catégories **avec au moins 1 produit** dans le rayon sont affichées (catégories vides masquées)

### Onglet Recherche (carte + recherche)

- Même système de pills + "Tout ▾" au-dessus de la carte/liste
- La recherche utilise les tags pour l'autocomplete : taper "Nike blanc" → suggestions basées sur les tags marque + couleur

### Panneau de filtres

- Icône filtre à côté des pills catégorie
- Ouvre un **bottom sheet** avec les filtres contextuels
- Les filtres affichés dépendent de la catégorie sélectionnée ET des tags existants
- Bouton "Voir les résultats (N)" en bas avec compteur temps réel

---

## 5. Tags dans la recherche intelligente

Les tags nourrissent l'autocomplete de la barre de recherche :

- L'utilisateur tape "nike" → suggestions :
  - 🏷️ **Nike** — 45 produits dans 6 boutiques
  - 👟 **Nike Air Force 1** — 12 en stock près de toi
  - 🏪 **Sneakers District** — 28 produits Nike · 500m
- Résultats mixtes : **tags, produits ET boutiques**
- Les suggestions sont triées par pertinence × proximité
- La recherche fonctionne sur : nom du produit, marque (tag), catégorie, nom de boutique

---

## 6. Expérience marchand

### Onboarding (ce qui change)

L'étape "Connecter votre caisse (POS)" déclenche automatiquement :
1. Sync des produits (existant)
2. Enrichissement EAN (existant)
3. **Auto-catégorisation IA** (nouveau) → ~30 secondes
4. La catégorie du marchand est déduite automatiquement
5. Le marchand peut vérifier/corriger dans une page dédiée (optionnel)

### Dashboard — Page "Vérifier vos catégories"

- Accessible depuis l'onboarding (étape optionnelle) ou depuis le menu Produits
- Liste les produits groupés par catégorie assignée
- Badge de confiance IA (vert > 90%, jaune 70-90%, rouge < 70%)
- Le marchand peut re-assigner la catégorie d'un tap (dropdown avec l'arbre)
- Bouton "Tout valider" pour confirmer en masse

---

## 7. Migration depuis le système actuel

### Ce qui change

- La constante `CONSUMER_CATEGORIES` dans `lib/categories.ts` (8 catégories en dur) est remplacée par une query Supabase sur la table `categories`
- Les pills et filtres deviennent dynamiques (alimentés par la DB)
- Les produits existants sont re-catégorisés par le pipeline IA (one-shot migration)
- Les marchands existants reçoivent une catégorie primaire déduite

### Ce qui ne change PAS

- Les API routes existantes (`/api/discover`, `/api/search`, `/api/products`)
- Le système de favoris et follows
- Le POS sync engine
- L'extraction de taille (`extract-size.ts`)
- La bottom nav et le header TikTok (Phase 2)

---

## 8. Principes validés

1. **Zéro hardcode** — Catégories en DB, jamais en dur dans le code
2. **Full auto** — Le marchand ne catégorise rien, l'IA fait tout
3. **Filtres dynamiques** — Apparaissent selon la catégorie ET les données disponibles
4. **Pills + drawer** — 6-8 catégories populaires visibles + arbre complet en bottom sheet
5. **Tags partout** — Alimentent filtres ET recherche intelligente
6. **Correction optionnelle** — Le marchand peut corriger mais n'y est pas obligé
7. **Pattern Vinted** — Navigation hiérarchique, filtres contextuels, recherche par tags
