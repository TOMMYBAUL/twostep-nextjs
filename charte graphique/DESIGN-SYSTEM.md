# Two-Step · Design System
> Charte graphique officielle — Thème **Minuit Électrique**
> À placer dans `docs/DESIGN-SYSTEM.md` et référencer depuis `CLAUDE.md`

---

## 1. Philosophie visuelle

Two-Step est une marketplace premium locale. L'identité visuelle doit refléter :
- **Sobriété éditorialiste** : l'ambiance d'un magazine de mode haut de gamme (références : SSENSE, Vestiaire Collective, Net-a-Porter)
- **Lisibilité maximale** : le fond sombre ne doit jamais sacrifier la lecture
- **Le prix est discret** : `font-weight: 400`, couleur atténuée — on ne met pas l'accent sur l'argent, c'est une règle de style premium
- **Le nom Two-Step est mis en valeur** : toujours affiché en Cormorant Garamond, jamais en minuscules, jamais en gras

---

## 2. Palette de couleurs

### Fonds (du plus sombre au plus clair)

| Token CSS              | Valeur hex | Rôle                          |
|------------------------|------------|-------------------------------|
| `--color-bg`           | `#070A10`  | Fond principal (toutes pages) |
| `--color-surface`      | `#0E1420`  | Cards, modals, bottom sheets  |
| `--color-elevated`     | `#141B2E`  | Éléments surélevés, hover     |

### Texte

| Token CSS              | Valeur hex | Rôle                         |
|------------------------|------------|------------------------------|
| `--color-text-primary` | `#C8D6F0`  | Titres, noms de produits      |
| `--color-text-secondary`| `#566080` | Descriptions, métadonnées     |
| `--color-text-muted`   | `#3D4D70`  | Labels discrets, prix         |

### Accent

| Token CSS              | Valeur hex | Rôle                                |
|------------------------|------------|-------------------------------------|
| `--color-accent`       | `#4268FF`  | CTA principal, badges "En stock"    |
| `--color-accent-light` | `#93AEFF`  | Texte sur fond accent, tags soft    |

### Bordures

| Token CSS              | Valeur                          | Rôle            |
|------------------------|---------------------------------|-----------------|
| `--color-border`       | `rgba(100, 140, 220, 0.15)`     | Bordure standard|
| `--color-border-accent`| `rgba(66, 104, 255, 0.28)`      | Card sélectionnée, focus |

---

## 3. Typographie

### Règle fondamentale : deux familles, deux rôles

| Famille               | Usage                                    | Import Google Fonts |
|-----------------------|------------------------------------------|---------------------|
| **Cormorant Garamond** | Titres, nom de marque, titres produits   | `wght@300;400`, italic 300 |
| **Syne**              | Navigation, boutons, labels, corps UI    | `wght@400;500;700`  |

### Import (à placer dans `<head>` ou `globals.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Syne:wght@400;500;700&display=swap');
```

### Échelle typographique

| Élément              | Famille           | Taille  | Poids | Lettre-espacement | Couleur               |
|----------------------|-------------------|---------|-------|-------------------|-----------------------|
| Marque (logo texte)  | Cormorant Garamond | 28–68px | 300   | `0.1em`           | `--color-text-primary`|
| Titre page           | Cormorant Garamond | 44px    | 300   | `0.04em`          | `--color-text-primary`|
| Titre produit (card) | Cormorant Garamond | 15px    | 400   | normal            | `--color-text-primary`|
| Titre section        | Syne              | 11px    | 500   | `0.12em`          | `--color-text-muted`  |
| Corps / description  | Syne              | 15px    | 400   | normal            | `--color-text-secondary`|
| Prix                 | Syne              | 12px    | 400   | normal            | `--color-text-muted`  |
| Labels / badges      | Syne              | 11px    | 500   | `0.05em`          | selon badge           |
| Bouton               | Syne              | 13px    | 500   | `0.04em`          | selon variante        |

### Règle prix (IMPORTANTE)
```css
.price {
  font-weight: 400;       /* jamais bold */
  color: var(--color-text-muted); /* #3D4D70, jamais primary */
  font-family: 'Syne', sans-serif;
}
```

---

## 4. Variables CSS globales

À placer dans `globals.css` ou équivalent Tailwind/CSS-in-JS :

```css
:root {
  /* Fonds */
  --color-bg: #070A10;
  --color-surface: #0E1420;
  --color-elevated: #141B2E;

  /* Texte */
  --color-text-primary: #C8D6F0;
  --color-text-secondary: #566080;
  --color-text-muted: #3D4D70;

  /* Accent */
  --color-accent: #4268FF;
  --color-accent-light: #93AEFF;
  --color-accent-bg: rgba(66, 104, 255, 0.10);
  --color-accent-border: rgba(66, 104, 255, 0.22);

  /* Bordures */
  --color-border: rgba(100, 140, 220, 0.15);
  --color-border-strong: rgba(100, 140, 220, 0.28);

  /* Typographie */
  --font-display: 'Cormorant Garamond', Georgia, serif;
  --font-ui: 'Syne', system-ui, sans-serif;

  /* Rayons */
  --radius-sm: 5px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 14px;
}
```

---

## 5. Composants

### Bouton principal (CTA)

```css
.btn-primary {
  background: var(--color-accent);        /* #4268FF */
  color: #ffffff;
  border: none;
  border-radius: var(--radius-md);
  padding: 11px 22px;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
```

### Bouton secondaire (outline)

```css
.btn-secondary {
  background: transparent;
  color: var(--color-text-primary);
  border: 0.5px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 11px 22px;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
}
```

### Bouton fantôme (Favoris, etc.)

```css
.btn-ghost {
  background: var(--color-accent-bg);
  color: var(--color-accent-light);
  border: none;
  border-radius: var(--radius-md);
  padding: 11px 22px;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
}
```

### Badges / Tags

```css
/* En stock */
.badge-stock {
  background: var(--color-accent);
  color: #ffffff;
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.05em;
}

/* Taille disponible */
.badge-size {
  background: var(--color-accent-bg);
  color: var(--color-accent-light);
  border: 0.5px solid var(--color-accent-border);
  border-radius: var(--radius-sm);
  padding: 4px 11px;
  font-size: 11px;
  font-weight: 500;
}

/* Épuisé */
.badge-sold-out {
  background: rgba(86, 96, 128, 0.18);
  color: var(--color-text-secondary);
  border-radius: var(--radius-sm);
  padding: 4px 11px;
  font-size: 11px;
  font-weight: 500;
}

/* Tag boutique / marque */
.badge-tag {
  background: transparent;
  color: var(--color-accent);
  border: 0.5px solid rgba(66, 104, 255, 0.30);
  border-radius: var(--radius-sm);
  padding: 4px 11px;
  font-size: 11px;
  font-weight: 500;
}
```

### Card produit

```css
.product-card {
  background: var(--color-surface);       /* #0E1420 */
  border-radius: var(--radius-lg);
  border: 0.5px solid var(--color-border);
  overflow: hidden;
}

.product-card__image {
  height: 200px;
  background: var(--color-elevated);
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-card__body {
  padding: 14px;
}

.product-card__name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 400;
  color: var(--color-text-primary);
  margin-bottom: 3px;
}

.product-card__meta {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}

.product-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

### Sélecteur de tailles (bottom sheet)

**Règle importante** : n'afficher QUE les tailles disponibles en stock pour le produit concerné. Jamais une liste statique exhaustive.

```css
.size-btn {
  background: var(--color-elevated);
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 14px;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-text-primary);
  cursor: pointer;
  text-align: center;
}

.size-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-light);
}

.size-btn.selected {
  background: var(--color-accent-bg);
  border-color: var(--color-accent);
  color: var(--color-accent-light);
}

.size-btn.unavailable {
  /* Option A : masquer complètement */
  display: none;

  /* Option B : afficher grisée (si on veut montrer ce qui n'est pas dispo) */
  /* opacity: 0.3; cursor: not-allowed; text-decoration: line-through; */
}
```

### Label section (micro-texte)

```css
.section-label {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
  color: var(--color-text-muted);
  text-transform: uppercase;
  margin-bottom: 18px;
}
```

---

## 6. Ancien thème → Nouveau thème (table de correspondance)

| Ancienne variable      | Ancienne valeur | Nouvelle variable          | Nouvelle valeur |
|------------------------|-----------------|----------------------------|-----------------|
| fond principal         | `#130e07`       | `--color-bg`               | `#070A10`       |
| fond card              | `#1e1409`       | `--color-surface`          | `#0E1420`       |
| accent doré            | `#c87830`       | `--color-accent`           | `#4268FF`       |
| texte primaire         | `#f0dfc0`       | `--color-text-primary`     | `#C8D6F0`       |
| texte secondaire       | `#a07840`       | `--color-text-secondary`   | `#566080`       |

---

## 7. Règles à toujours respecter

1. **Jamais de fond blanc ou clair** — Two-Step est full dark mode
2. **Le prix est discret** — `font-weight: 400`, couleur `--color-text-muted`
3. **Les tailles affichées = stock réel** — aucune liste statique de pointures
4. **Le nom "TWO—STEP" est en Cormorant Garamond, poids 300** — pas de variantes
5. **Les titres de produits sont en Cormorant Garamond** — toute l'UI est en Syne
6. **Les CTA primaires sont toujours en `--color-accent` (`#4268FF`)** — jamais dorés
7. **Pas d'ombres portées lourdes** — seulement des bordures `0.5px` et des bg légèrement différents pour la profondeur
8. **Letter-spacing sur les labels** — `0.05em` à `0.12em` selon la taille

---

## 8. Références design

- **Vestiaire Collective** (nouvelle version) — éditorial sombre, typographie serif fine
- **SSENSE** — densité, précision, no-nonsense
- **Net-a-Porter** — luxe sobre, hiérarchie claire
- **Louis Vuitton digital** — nom de marque en display font, respect du blanc (ici : du sombre)

---

*Dernière mise à jour : mars 2026 — Thème Minuit Électrique v1.0*
